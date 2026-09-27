use image::DynamicImage;
use serde::Deserialize;

use super::{Result, StudioError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutFormat {
    Jpeg,
    Png,
    Webp,
    Avif,
    Tiff,
    Bmp,
    Svg,
    Ico,
}

impl OutFormat {
    pub fn extension(self) -> &'static str {
        match self {
            OutFormat::Jpeg => "jpg",
            OutFormat::Png => "png",
            OutFormat::Webp => "webp",
            OutFormat::Avif => "avif",
            OutFormat::Tiff => "tiff",
            OutFormat::Bmp => "bmp",
            OutFormat::Svg => "svg",
            OutFormat::Ico => "ico",
        }
    }

    /// Lossless formats ignore the quality setting entirely.
    pub fn uses_quality(self) -> bool {
        matches!(self, OutFormat::Jpeg | OutFormat::Png | OutFormat::Avif)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct EncodeSettings {
    pub format: OutFormat,
    /// 1–100. Interpreted per format: JPEG/WebP/AVIF quality, PNG compression effort.
    pub quality: u8,
}

/// Encode to the target format. JPEG flattens transparency onto white.
pub fn encode(img: &DynamicImage, settings: &EncodeSettings) -> Result<Vec<u8>> {
    let q = settings.quality.clamp(1, 100);
    match settings.format {
        OutFormat::Jpeg => encode_jpeg(&flatten_to_rgb(img), q),
        OutFormat::Png => encode_png(img, q),
        OutFormat::Webp => encode_webp(img, q),
        OutFormat::Avif => encode_avif(img, q),
        OutFormat::Tiff => encode_tiff(img),
        OutFormat::Bmp => encode_bmp(img),
        OutFormat::Svg => encode_svg(img),
        OutFormat::Ico => encode_ico(img),
    }
}

fn encode_jpeg(rgb: &image::RgbImage, q: u8) -> Result<Vec<u8>> {
    use image::ImageEncoder;
    let mut buf = Vec::new();
    let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, q);
    enc.write_image(
        rgb.as_raw(),
        rgb.width(),
        rgb.height(),
        image::ExtendedColorType::Rgb8,
    )
    .map_err(|e| StudioError::Encode(format!("jpeg: {e}")))?;
    Ok(buf)
}

fn encode_png(img: &DynamicImage, q: u8) -> Result<Vec<u8>> {
    use image::ImageEncoder;
    let rgba = img.to_rgba8();
    let compression = if q >= 67 {
        image::codecs::png::CompressionType::Best
    } else if q >= 34 {
        image::codecs::png::CompressionType::Default
    } else {
        image::codecs::png::CompressionType::Fast
    };
    let mut buf = Vec::new();
    let enc = image::codecs::png::PngEncoder::new_with_quality(
        &mut buf,
        compression,
        image::codecs::png::FilterType::Adaptive,
    );
    enc.write_image(
        rgba.as_raw(),
        rgba.width(),
        rgba.height(),
        image::ExtendedColorType::Rgba8,
    )
    .map_err(|e| StudioError::Encode(format!("png: {e}")))?;
    Ok(buf)
}

/// The pure-Rust WebP encoder is lossless-only (VP8L); quality is not applied.
fn encode_webp(img: &DynamicImage, _q: u8) -> Result<Vec<u8>> {
    use image::ImageEncoder;
    let rgba = img.to_rgba8();
    let mut buf = Vec::new();
    let enc = image::codecs::webp::WebPEncoder::new_lossless(&mut buf);
    enc.write_image(
        rgba.as_raw(),
        rgba.width(),
        rgba.height(),
        image::ExtendedColorType::Rgba8,
    )
    .map_err(|e| StudioError::Encode(format!("webp: {e}")))?;
    Ok(buf)
}

fn encode_avif(img: &DynamicImage, q: u8) -> Result<Vec<u8>> {
    let rgba = img.to_rgba8();
    let pixels: Vec<rgb::RGBA8> = rgba
        .pixels()
        .map(|p| rgb::RGBA {
            r: p[0],
            g: p[1],
            b: p[2],
            a: p[3],
        })
        .collect();
    let width = rgba.width() as usize;
    let height = rgba.height() as usize;
    let frame = imgref::Img::new(pixels.as_slice(), width, height);
    let encoder = ravif::Encoder::new()
        .with_quality(q as f32)
        .with_speed(8);
    let encoded = encoder
        .encode_rgba(frame)
        .map_err(|e| StudioError::Encode(format!("avif: {e}")))?;
    Ok(encoded.avif_file)
}

/// TIFF output: lossless, alpha preserved. Quality is not applied.
fn encode_tiff(img: &DynamicImage) -> Result<Vec<u8>> {
    use image::ImageEncoder;
    let rgba = img.to_rgba8();
    let mut buf = std::io::Cursor::new(Vec::new());
    let enc = image::codecs::tiff::TiffEncoder::new(&mut buf);
    enc.write_image(
        rgba.as_raw(),
        rgba.width(),
        rgba.height(),
        image::ExtendedColorType::Rgba8,
    )
    .map_err(|e| StudioError::Encode(format!("tiff: {e}")))?;
    Ok(buf.into_inner())
}

/// BMP output: lossless, alpha preserved. Quality is not applied.
fn encode_bmp(img: &DynamicImage) -> Result<Vec<u8>> {
    use image::ImageEncoder;
    let rgba = img.to_rgba8();
    let mut buf = Vec::new();
    let enc = image::codecs::bmp::BmpEncoder::new(&mut buf);
    enc.write_image(
        rgba.as_raw(),
        rgba.width(),
        rgba.height(),
        image::ExtendedColorType::Rgba8,
    )
    .map_err(|e| StudioError::Encode(format!("bmp: {e}")))?;
    Ok(buf)
}

/// SVG output: the (losslessly PNG-encoded) raster image embedded in a
/// minimal SVG 1.1 wrapper. The result is a valid .svg usable anywhere,
/// though the pixels stay raster — this is not vector tracing.
fn encode_svg(img: &DynamicImage) -> Result<Vec<u8>> {
    use base64::Engine;
    let png = encode_png(img, 100)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
    let svg = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"{}\" height=\"{}\" viewBox=\"0 0 {} {}\">\n  <image xlink:href=\"data:image/png;base64,{}\" width=\"{}\" height=\"{}\"/>\n</svg>\n",
        img.width(),
        img.height(),
        img.width(),
        img.height(),
        b64,
        img.width(),
        img.height(),
    );
    Ok(svg.into_bytes())
}

/// ICO output: a single 256×256-max PNG frame inside an ICO container
/// (Windows icon format). Lossless; quality is not applied.
fn encode_ico(img: &DynamicImage) -> Result<Vec<u8>> {
    use image::ImageEncoder;
    let rgba = img.to_rgba8();
    let mut buf = Vec::new();
    let enc = image::codecs::ico::IcoEncoder::new(&mut buf);
    enc.write_image(
        rgba.as_raw(),
        rgba.width(),
        rgba.height(),
        image::ExtendedColorType::Rgba8,
    )
    .map_err(|e| StudioError::Encode(format!("ico: {e}")))?;
    Ok(buf)
}

/// Composite alpha onto white (JPEG has no transparency).
fn flatten_to_rgb(img: &DynamicImage) -> image::RgbImage {
    match img {
        DynamicImage::ImageRgba8(rgba) => {
            let mut out = image::RgbImage::new(rgba.width(), rgba.height());
            for (x, y, px) in rgba.enumerate_pixels() {
                let a = px[3] as u32;
                let blend = |c: u8| -> u8 {
                    ((c as u32 * a + 255 * (255 - a)) / 255) as u8
                };
                out.put_pixel(x, y, image::Rgb([blend(px[0]), blend(px[1]), blend(px[2])]));
            }
            out
        }
        other => other.to_rgb8(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, GenericImageView, RgbaImage};

    fn sample() -> DynamicImage {
        let mut img = RgbaImage::new(64, 48);
        for (x, y, px) in img.enumerate_pixels_mut() {
            *px = image::Rgba([(x * 4) as u8, (y * 5) as u8, 128, 255]);
        }
        DynamicImage::ImageRgba8(img)
    }

    #[test]
    fn roundtrip_all_formats() {
        let img = sample();
        for format in [
            OutFormat::Jpeg,
            OutFormat::Png,
            OutFormat::Webp,
            OutFormat::Avif,
            OutFormat::Tiff,
            OutFormat::Bmp,
            OutFormat::Svg,
            OutFormat::Ico,
        ] {
            let bytes = encode(&img, &EncodeSettings { format, quality: 80 }).unwrap();
            assert!(!bytes.is_empty(), "{format:?} produced empty output");
            if !matches!(format, OutFormat::Avif | OutFormat::Svg) {
                // AVIF/SVG decode is not enabled in the image crate; the
                // others must decode back.
                let re = image::load_from_memory(&bytes).unwrap();
                assert_eq!(re.dimensions(), (64, 48), "{format:?} roundtrip size");
            }
            if format == OutFormat::Svg {
                let text = String::from_utf8(bytes).unwrap();
                assert!(text.contains("<svg") && text.contains("data:image/png;base64,"));
            }
        }
    }

    #[test]
    fn jpeg_flattens_transparent_to_white() {
        let mut img = RgbaImage::new(8, 8);
        for (_x, _y, px) in img.enumerate_pixels_mut() {
            *px = image::Rgba([10, 20, 30, 0]);
        }
        let bytes = encode(
            &DynamicImage::ImageRgba8(img),
            &EncodeSettings { format: OutFormat::Jpeg, quality: 90 },
        )
        .unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap().to_rgb8();
        let px = decoded.get_pixel(4, 4);
        assert!(px[0] > 230 && px[1] > 230 && px[2] > 230, "got {px:?}");
    }

    #[test]
    fn webp_is_lossless_and_decodable() {
        let img = sample();
        let bytes = encode(
            &img,
            &EncodeSettings { format: OutFormat::Webp, quality: 50 },
        )
        .unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!(decoded.dimensions(), (64, 48));
        // Lossless: pixels must round-trip exactly.
        assert_eq!(
            decoded.to_rgba8().as_raw(),
            img.to_rgba8().as_raw()
        );
    }
}
