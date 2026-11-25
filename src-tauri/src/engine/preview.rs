//! One bounded decoded-image cache. UI preview requests are serialized, so
//! expensive codecs cannot fan out while the user adjusts their settings.
use super::{decode, encode, guard, ops, Result, StudioError};
use std::{
    borrow::Cow,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::SystemTime,
};

pub struct Source {
    pub bytes: Vec<u8>,
    pub image: image::DynamicImage,
}

struct Cached {
    path: PathBuf,
    modified: Option<SystemTime>,
    len: u64,
    source: Option<Arc<Source>>,
    crop: Option<CropSource>,
}

struct CropSource {
    image: image::DynamicImage,
    width: u32,
    height: u32,
}

const MAX_CACHED_BYTES: usize = 128 * 1024 * 1024;
const CROP_PREVIEW_EDGE: u32 = 1600;

fn with_cached_file<T>(path: &Path, read: impl FnOnce(&mut Cached) -> Result<T>) -> Result<T> {
    static CACHE: OnceLock<Mutex<Option<Cached>>> = OnceLock::new();
    let path = std::fs::canonicalize(path)
        .map_err(|e| StudioError::Io(format!("cannot read {}: {e}", path.display())))?;
    let meta = guard::validate_input_file(&path)?;
    let modified = meta.modified().ok();
    let mut cache = CACHE.get_or_init(|| Mutex::new(None)).lock().unwrap();
    if modified.is_none()
        || cache.as_ref().is_none_or(|entry| {
            entry.path != path || entry.modified != modified || entry.len != meta.len()
        })
    {
        *cache = Some(Cached {
            path,
            modified,
            len: meta.len(),
            source: None,
            crop: None,
        });
    }
    read(cache.as_mut().unwrap())
}

pub fn load(path: &Path) -> Result<Arc<Source>> {
    with_cached_file(path, |entry| {
        if let Some(source) = &entry.source {
            return Ok(source.clone());
        }
        let bytes = decode::read_bytes(&entry.path)?;
        let image = decode::decode_bytes(&bytes)?;
        let size = image.as_bytes().len().saturating_add(bytes.len());
        let source = Arc::new(Source { bytes, image });
        if size <= MAX_CACHED_BYTES {
            entry.source = Some(source.clone());
        }
        Ok(source)
    })
}

#[derive(serde::Serialize)]
pub struct CropPreview {
    pub data_url: String,
    pub width: u32,
    pub height: u32,
}

pub fn crop(path: &Path, steps: &[ops::Step]) -> Result<CropPreview> {
    if steps.len() > 3 {
        return Err(StudioError::Param("too many crop preview steps".into()));
    }
    let mut swap_dimensions = false;
    for step in steps {
        match step {
            ops::Step::Rotate90 | ops::Step::Rotate270 => swap_dimensions = !swap_dimensions,
            ops::Step::Rotate180 | ops::Step::FlipH | ops::Step::FlipV => {}
            _ => return Err(StudioError::Param("unsupported crop preview step".into())),
        }
    }

    // Cache the bounded raster even when the full image is too large to keep.
    with_cached_file(path, |entry| {
        if entry.crop.is_none() {
            let source = match &entry.source {
                Some(source) => Cow::Borrowed(&source.image),
                None => Cow::Owned(decode::decode_file(&entry.path)?),
            };
            let (width, height) = (source.width(), source.height());
            let image = if width.max(height) > CROP_PREVIEW_EDGE {
                source.thumbnail(CROP_PREVIEW_EDGE, CROP_PREVIEW_EDGE)
            } else {
                source.into_owned()
            };
            entry.crop = Some(CropSource {
                image,
                width,
                height,
            });
        }
        let source = entry.crop.as_ref().unwrap();
        let image = if steps.is_empty() {
            Cow::Borrowed(&source.image)
        } else {
            Cow::Owned(ops::apply_steps(source.image.clone(), steps)?)
        };
        let encoded = encode::encode(
            &image,
            &encode::EncodeSettings {
                format: encode::OutFormat::Png,
                quality: 33,
            },
        )?;
        let (width, height) = if swap_dimensions {
            (source.height, source.width)
        } else {
            (source.width, source.height)
        };
        use base64::Engine;
        Ok(CropPreview {
            data_url: format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(encoded)
            ),
            width,
            height,
        })
    })
}
