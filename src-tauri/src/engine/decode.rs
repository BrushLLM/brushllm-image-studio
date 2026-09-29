use std::path::Path;

use super::encode;
use super::{Result, StudioError};

/// Decode any supported input format into a DynamicImage. GIF yields its
/// first frame. SVG is rasterized by the pure-Rust resvg crate (the `image`
/// crate has no SVG support); everything else goes through `image`.
pub fn decode_file(path: &Path) -> Result<image::DynamicImage> {
    let bytes = read_bytes(path)?;
    decode_bytes(&bytes)
}

/// Decode from bytes that were ALREADY read (e.g. for format sniffing) —
/// avoids reading the same file twice per command.
pub fn decode_from_buffer(bytes: &[u8]) -> Result<image::DynamicImage> {
    decode_bytes(bytes)
}

pub fn decode_bytes(bytes: &[u8]) -> Result<image::DynamicImage> {
    let img = if is_svg(bytes) {
        decode_svg(bytes)?
    } else {
        image::load_from_memory(bytes).map_err(|e| {
            StudioError::Decode(format!(
                "{e}. Note: HEIC/HEIF and AVIF inputs are not supported."
            ))
        })?
    };
    // Central pixel budget — applies to every decode path.
    super::guard::validate_pixels(img.width() as u64, img.height() as u64, "decoded image")?;
    Ok(img)
}

/// SVGs are XML documents starting (after whitespace/BOM) with `<?xml`,
/// `<!DOCTYPE svg` or `<svg`.
fn is_svg(bytes: &[u8]) -> bool {
    let start = bytes
        .iter()
        .position(|b| !b.is_ascii_whitespace())
        .unwrap_or(bytes.len());
    let slice = &bytes[start..];
    slice.starts_with(b"<?xml")
        || slice.starts_with(b"<!DOCTYPE svg")
        || slice.starts_with(b"<svg")
        || slice.starts_with(&[0xEF, 0xBB, 0xBF]) // UTF-8 BOM — peek further below
        || {
            // BOM + xml prolog: search the first 512 bytes for an svg root.
            bytes.len() > 3
                && bytes.starts_with(&[0xEF, 0xBB, 0xBF])
                && bytes[..bytes.len().min(512)]
                    .windows(4)
                    .any(|w| w == b"<svg")
        }
}

/// Rasterize an SVG at its declared size (clamped to 8192px on the long edge,
/// falling back to 1024px when the file declares none).
fn decode_svg(bytes: &[u8]) -> Result<image::DynamicImage> {
    let tree = resvg::usvg::Tree::from_data(bytes, &resvg::usvg::Options::default())
        .map_err(|e| StudioError::Decode(format!("svg: {e}")))?;
    let size = tree.size();
    let (mut w, mut h) = (size.width(), size.height());
    if !w.is_finite() || !h.is_finite() || w <= 0.0 || h <= 0.0 {
        w = 1024.0;
        h = 1024.0;
    }
    let max_side = w.max(h);
    if max_side > 8192.0 {
        let k = 8192.0 / max_side;
        w *= k;
        h *= k;
    }
    // Total-pixel cap for rasterized SVGs.
    if (w * h) as u64 > super::guard::limits::MAX_SVG_PIXELS {
        return Err(StudioError::Param(format!(
            "SVG rasterizes to too many pixels ({} MP limit)",
            super::guard::limits::MAX_SVG_PIXELS / 1_000_000
        )));
    }
    let wpx = w.round().max(1.0) as u32;
    let hpx = h.round().max(1.0) as u32;
    let mut pixmap = resvg::tiny_skia::Pixmap::new(wpx, hpx)
        .ok_or_else(|| StudioError::Decode("svg: cannot allocate pixmap".into()))?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::default(),
        &mut pixmap.as_mut(),
    );
    // tiny-skia gives premultiplied RGBA; image::RgbaImage wants straight alpha.
    let data = pixmap.take();
    let mut rgba = image::RgbaImage::new(wpx, hpx);
    for (i, px) in rgba.pixels_mut().enumerate() {
        let (r, g, b, a) = (
            data[i * 4],
            data[i * 4 + 1],
            data[i * 4 + 2],
            data[i * 4 + 3],
        );
        if a == 0 || a == 255 {
            *px = image::Rgba([r, g, b, a]);
        } else {
            let un =
                |c: u8| -> u8 { (((c as u32) * 255 + (a as u32) / 2) / a as u32).min(255) as u8 };
            *px = image::Rgba([un(r), un(g), un(b), a]);
        }
    }
    Ok(image::DynamicImage::ImageRgba8(rgba))
}

pub fn read_bytes(path: &Path) -> Result<Vec<u8>> {
    std::fs::read(path).map_err(|e| StudioError::Io(format!("cannot read {}: {e}", path.display())))
}

/// Map the on-disk format of an already-read buffer onto an encodable output
/// format. SVG stays SVG (re-embedded losslessly); formats we cannot encode
/// (GIF, ICO) fall back to PNG.
pub fn same_output_format(bytes: &[u8]) -> encode::OutFormat {
    if is_svg(bytes) {
        return encode::OutFormat::Svg;
    }
    match image::guess_format(bytes).ok() {
        Some(image::ImageFormat::Png) => encode::OutFormat::Png,
        Some(image::ImageFormat::Jpeg) => encode::OutFormat::Jpeg,
        Some(image::ImageFormat::WebP) => encode::OutFormat::Webp,
        Some(image::ImageFormat::Tiff) => encode::OutFormat::Tiff,
        Some(image::ImageFormat::Bmp) => encode::OutFormat::Bmp,
        Some(image::ImageFormat::Ico) => encode::OutFormat::Ico,
        _ => encode::OutFormat::Png,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Local smoke check against real SVG files (SVG_SAMPLE / SVG_SAMPLE_2).
    #[test]
    fn decode_svg_sample_local() {
        let Ok(first) = std::env::var("SVG_SAMPLE") else {
            return;
        };
        for path in std::iter::once(first).chain(std::env::var("SVG_SAMPLE_2")) {
            let img =
                decode_file(std::path::Path::new(&path)).unwrap_or_else(|e| panic!("{path}: {e}"));
            assert!(img.width() > 0 && img.height() > 0, "{path}: empty image");
            let rgba = img.to_rgba8();
            // Something non-transparent must have been painted.
            assert!(
                rgba.pixels().any(|p| p[3] > 0),
                "{path}: rendered fully transparent"
            );
        }
    }
}
