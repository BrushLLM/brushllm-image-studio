//! One bounded decoded-image cache. UI preview requests are serialized, so
//! expensive codecs cannot fan out while the user adjusts their settings.
use super::{decode, guard, Result};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::SystemTime,
};

pub struct Source {
    pub bytes: Vec<u8>,
    pub image: image::DynamicImage,
}

struct Cached {
    path: PathBuf,
    modified: SystemTime,
    len: u64,
    source: Arc<Source>,
}

pub fn load(path: &std::path::Path) -> Result<Arc<Source>> {
    static CACHE: OnceLock<Mutex<Option<Cached>>> = OnceLock::new();
    guard::validate_input_file(path)?;
    let path = std::fs::canonicalize(path).map_err(|e| super::StudioError::Io(e.to_string()))?;
    let meta = std::fs::metadata(&path).map_err(|e| super::StudioError::Io(e.to_string()))?;
    let modified = meta.modified().ok();
    let mut cache = CACHE.get_or_init(|| Mutex::new(None)).lock().unwrap();
    if let Some(entry) = cache.as_ref() {
        if entry.path == path && Some(entry.modified) == modified && entry.len == meta.len() {
            return Ok(entry.source.clone());
        }
    }
    // Drop the previous large source before allocating a new one.
    *cache = None;
    let bytes = decode::read_bytes(&path)?;
    let image = decode::decode_from_buffer(&bytes)?;
    let size = image.as_bytes().len().saturating_add(bytes.len());
    let source = Arc::new(Source { bytes, image });
    if let Some(modified) = modified {
        if size <= 128 * 1024 * 1024 {
            *cache = Some(Cached {
                path,
                modified,
                len: meta.len(),
                source: source.clone(),
            });
        }
    }
    Ok(source)
}
