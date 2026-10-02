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
    #[allow(dead_code)]
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
    // Keep the source color type: padding an alpha channel onto RGB input
    // bloats the data by a third and hurts filter prediction — re-encoded
    // "compressed" files came out LARGER than the originals.
    let result = match img {
        DynamicImage::ImageLuma8(g) => enc.write_image(
            g.as_raw(),
            g.width(),
            g.height(),
            image::ExtendedColorType::L8,
        ),
        DynamicImage::ImageLumaA8(ga) => enc.write_image(
            ga.as_raw(),
            ga.width(),
            ga.height(),
            image::ExtendedColorType::La8,
        ),
        DynamicImage::ImageRgb8(rgb) => enc.write_image(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        ),
        DynamicImage::ImageRgba8(rgba) => enc.write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            image::ExtendedColorType::Rgba8,
        ),
        // 16-bit and exotic inputs: downconvert (same as before).
        _ => {
            let rgba = img.to_rgba8();
            enc.write_image(
                rgba.as_raw(),
                rgba.width(),
                rgba.height(),
                image::ExtendedColorType::Rgba8,
            )
        }
    };
    result.map_err(|e| StudioError::Encode(format!("png: {e}")))?;
    Ok(buf)
}

/// The pure-Rust WebP encoder is lossless-only (VP8L); quality is not applied.
fn encode_webp(img: &DynamicImage, _q: u8) -> Result<Vec<u8>> {
    use image::ImageEncoder;
    let mut buf = Vec::new();
    let enc = image::codecs::webp::WebPEncoder::new_lossless(&mut buf);
    // Same color-type preservation as PNG — no padded alpha for RGB input.
    let result = match img {
        DynamicImage::ImageRgb8(rgb) => enc.write_image(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        ),
        DynamicImage::ImageRgba8(rgba) => enc.write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            image::ExtendedColorType::Rgba8,
        ),
        DynamicImage::ImageLuma8(g) => enc.write_image(
            g.as_raw(),
            g.width(),
            g.height(),
            image::ExtendedColorType::L8,
        ),
        DynamicImage::ImageLumaA8(ga) => enc.write_image(
            ga.as_raw(),
            ga.width(),
            ga.height(),
            image::ExtendedColorType::La8,
        ),
        _ => {
            let rgba = img.to_rgba8();
            enc.write_image(
                rgba.as_raw(),
                rgba.width(),
                rgba.height(),
                image::ExtendedColorType::Rgba8,
            )
        }
    };
    result.map_err(|e| StudioError::Encode(format!("webp: {e}")))?;
    Ok(buf)
}

fn encode_avif(img: &DynamicImage, q: u8) -> Result<Vec<u8>> {
    let encoder = ravif::Encoder::new().with_quality(q as f32).with_speed(8);
    // RGB input skips the alpha plane — smaller output, faster encode.
    let encoded = if let DynamicImage::ImageRgb8(rgb) = img {
        let pixels: Vec<rgb::RGB8> = rgb
            .pixels()
            .map(|p| rgb::RGB {
                r: p[0],
                g: p[1],
                b: p[2],
            })
            .collect();
        let frame = imgref::Img::new(
            pixels.as_slice(),
            rgb.width() as usize,
            rgb.height() as usize,
        );
        encoder
            .encode_rgb(frame)
            .map_err(|e| StudioError::Encode(format!("avif: {e}")))?
    } else {
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
        let frame = imgref::Img::new(
            pixels.as_slice(),
            rgba.width() as usize,
            rgba.height() as usize,
        );
        encoder
            .encode_rgba(frame)
            .map_err(|e| StudioError::Encode(format!("avif: {e}")))?
    };
    Ok(encoded.avif_file)
}

/// TIFF output: lossless, alpha preserved. Quality is not applied.
/// TIFF with deflate + horizontal predictor (the image crate's encoder
/// writes uncompressed strips, which made every TIFF output enormous).
/// Color type is preserved — no padded alpha on RGB input.
fn encode_tiff(img: &DynamicImage) -> Result<Vec<u8>> {
    fn write_rgb(
        enc: &mut tiff::encoder::TiffEncoder<&mut std::io::Cursor<Vec<u8>>>,
        img: &DynamicImage,
    ) -> tiff::TiffResult<()> {
        match img {
            DynamicImage::ImageRgb8(rgb) => {
                let w =
                    enc.new_image::<tiff::encoder::colortype::RGB8>(rgb.width(), rgb.height())?;
                w.write_data(rgb.as_raw())
            }
            DynamicImage::ImageRgba8(rgba) => {
                let w =
                    enc.new_image::<tiff::encoder::colortype::RGBA8>(rgba.width(), rgba.height())?;
                w.write_data(rgba.as_raw())
            }
            DynamicImage::ImageLuma8(g) => {
                let w = enc.new_image::<tiff::encoder::colortype::Gray8>(g.width(), g.height())?;
                w.write_data(g.as_raw())
            }
            _ => {
                let rgba = img.to_rgba8();
                let w =
                    enc.new_image::<tiff::encoder::colortype::RGBA8>(rgba.width(), rgba.height())?;
                w.write_data(rgba.as_raw())
            }
        }
    }

    let mut buf = std::io::Cursor::new(Vec::new());
    let mut enc = tiff::encoder::TiffEncoder::new(&mut buf)
        .map_err(|e| StudioError::Encode(format!("tiff: {e}")))?;
    enc = enc
        .with_compression(tiff::encoder::Compression::Deflate(
            tiff::encoder::DeflateLevel::Best,
        ))
        .with_predictor(tiff::encoder::Predictor::Horizontal);
    write_rgb(&mut enc, img).map_err(|e| StudioError::Encode(format!("tiff: {e}")))?;
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
                let blend = |c: u8| -> u8 { ((c as u32 * a + 255 * (255 - a)) / 255) as u8 };
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

    /// PNG output must keep the source color type — padding RGB input
    /// with an alpha channel made "compressed" files LARGER than the
    /// originals. The IHDR color-type byte: 2 = RGB, 6 = RGBA, 0 = gray.

    #[test]
    fn png_output_keeps_rgb_color_type() {
        let mut rgb = image::RgbImage::new(64, 48);
        for (x, y, px) in rgb.enumerate_pixels_mut() {
            *px = image::Rgb([(x * 4) as u8, (y * 5) as u8, 128]);
        }
        let img = DynamicImage::ImageRgb8(rgb);
        let out = encode(
            &img,
            &EncodeSettings {
                format: OutFormat::Png,
                quality: 80,
            },
        )
        .unwrap();
        assert_eq!(
            out[25], 2,
            "IHDR color type must be RGB (2), got {}",
            out[25]
        );
    }

    #[test]
    fn png_output_keeps_rgba_color_type() {
        let out = encode(
            &sample(),
            &EncodeSettings {
                format: OutFormat::Png,
                quality: 80,
            },
        )
        .unwrap();
        assert_eq!(out[25], 6, "IHDR color type must be RGBA (6)");
    }

    /// TIFF must be deflate-compressed (not the enormous uncompressed
    /// strips the image crate writes by default).
    #[test]
    fn tiff_output_is_compressed() {
        let img = sample();
        let out = encode(
            &img,
            &EncodeSettings {
                format: OutFormat::Tiff,
                quality: 80,
            },
        )
        .unwrap();
        // 64x48 RGBA = 12,288 bytes raw; deflate must come in far below.
        assert!(
            out.len() < 12_000,
            "tiff output {} bytes — looks uncompressed",
            out.len()
        );
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
            let bytes = encode(
                &img,
                &EncodeSettings {
                    format,
                    quality: 80,
                },
            )
            .unwrap();
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
            &EncodeSettings {
                format: OutFormat::Jpeg,
                quality: 90,
            },
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
            &EncodeSettings {
                format: OutFormat::Webp,
                quality: 50,
            },
        )
        .unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!(decoded.dimensions(), (64, 48));
        // Lossless: pixels must round-trip exactly.
        assert_eq!(decoded.to_rgba8().as_raw(), img.to_rgba8().as_raw());
    }
}
