use image::DynamicImage;
use serde::Deserialize;

use super::{Result, StudioError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MirrorDir {
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FitMode {
    /// Contain within the target box, aspect ratio preserved.
    Fit,
    /// Cover the target box, then center-crop the overflow.
    Fill,
    /// Ignore aspect ratio and hit the exact target dimensions.
    Stretch,
}

/// One edit applied to an image. Steps are applied in array order.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Step {
    Resize {
        width: Option<u32>,
        height: Option<u32>,
        percent: Option<u32>,
        mode: FitMode,
        no_enlarge: bool,
    },
    Crop {
        x: u32,
        y: u32,
        width: u32,
        height: u32,
    },
    /// Brightness / contrast / saturation, each -100..=100 (0 = unchanged).
    Adjust {
        brightness: i32,
        contrast: i32,
        saturation: i32,
    },
    /// Kaleidoscope mirror: original + its reflection joined side by side
    /// ("horizontal" → A|A, doubling width) or top to bottom
    /// ("vertical" → A over A, doubling height).
    Mirror { direction: MirrorDir },
    Rotate90,
    Rotate180,
    Rotate270,
    FlipH,
    FlipV,
}

pub fn apply_steps(mut img: DynamicImage, steps: &[Step]) -> Result<DynamicImage> {
    for step in steps {
        img = apply_step(img, step)?;
    }
    Ok(img)
}

fn apply_step(img: DynamicImage, step: &Step) -> Result<DynamicImage> {
    match step {
        Step::Resize {
            width,
            height,
            percent,
            mode,
            no_enlarge,
        } => resize(img, *width, *height, *percent, *mode, *no_enlarge),
        Step::Crop {
            x,
            y,
            width,
            height,
        } => {
            let (iw, ih) = (img.width(), img.height());
            let x = (*x).min(iw.saturating_sub(1));
            let y = (*y).min(ih.saturating_sub(1));
            let w = (*width).min(iw - x);
            let h = (*height).min(ih - y);
            if w == 0 || h == 0 {
                return Err(StudioError::Param("crop region is empty".into()));
            }
            Ok(img.crop_imm(x, y, w, h))
        }
        Step::Rotate90 => Ok(img.rotate90()),
        Step::Rotate180 => Ok(img.rotate180()),
        Step::Rotate270 => Ok(img.rotate270()),
        Step::FlipH => Ok(img.fliph()),
        Step::FlipV => Ok(img.flipv()),
        Step::Adjust {
            brightness,
            contrast,
            saturation,
        } => adjust(img, *brightness, *contrast, *saturation),
        Step::Mirror { direction } => mirror(img, *direction),
    }
}

/// Join the image with its own reflection: horizontal → [img | flip_h(img)]
/// (width doubles), vertical → [img / flip_v(img)] (height doubles).
fn mirror(img: DynamicImage, direction: MirrorDir) -> Result<DynamicImage> {
    let base = img.to_rgba8();
    let (w, h) = base.dimensions();
    let (nw, nh) = match direction {
        MirrorDir::Horizontal => (w * 2, h),
        MirrorDir::Vertical => (w, h * 2),
    };
    let mut out = image::RgbaImage::new(nw, nh);
    image::imageops::overlay(&mut out, &base, 0, 0);
    let reflected = match direction {
        MirrorDir::Horizontal => image::imageops::flip_horizontal(&base),
        MirrorDir::Vertical => image::imageops::flip_vertical(&base),
    };
    let (dx, dy) = match direction {
        MirrorDir::Horizontal => (w, 0),
        MirrorDir::Vertical => (0, h),
    };
    image::imageops::overlay(&mut out, &reflected, dx as i64, dy as i64);
    Ok(DynamicImage::ImageRgba8(out))
}

/// Per-pixel brightness / contrast / saturation, each on a -100..=100 scale.
/// Brightness is a linear offset; contrast scales around the midpoint;
/// saturation lerps between grayscale and the original color.
fn adjust(img: DynamicImage, brightness: i32, contrast: i32, saturation: i32) -> Result<DynamicImage> {
    let b = brightness.clamp(-100, 100) as f32 / 100.0; // -1..=1
    let c = contrast.clamp(-100, 100) as f32 / 100.0;
    let s = saturation.clamp(-100, 100) as f32 / 100.0;

    let b_off = b * 255.0;
    // Contrast factor: 0 at -100, 1 (neutral) at 0, 3 at +100.
    let c_factor = if c >= 0.0 { 1.0 + c * 2.0 } else { 1.0 + c };
    // Saturation factor: 0 (grayscale) at -100, 1 at 0, 2 at +100.
    let s_factor = 1.0 + s;

    let mut out = img.to_rgba8();
    for px in out.pixels_mut() {
        let rgb = [px[0] as f32, px[1] as f32, px[2] as f32];
        let mut ch = rgb;
        // Saturation first (on the un-shifted color), then brightness and
        // contrast so the sliders compose predictably.
        if s_factor != 1.0 {
            let luma = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
            ch = rgb.map(|v| luma + (v - luma) * s_factor);
        }
        if b_off != 0.0 {
            ch = ch.map(|v| v + b_off);
        }
        if c_factor != 1.0 {
            ch = ch.map(|v| (v - 128.0) * c_factor + 128.0);
        }
        px[0] = ch[0].clamp(0.0, 255.0) as u8;
        px[1] = ch[1].clamp(0.0, 255.0) as u8;
        px[2] = ch[2].clamp(0.0, 255.0) as u8;
    }
    Ok(DynamicImage::ImageRgba8(out))
}

fn resize(
    img: DynamicImage,
    width: Option<u32>,
    height: Option<u32>,
    percent: Option<u32>,
    mode: FitMode,
    no_enlarge: bool,
) -> Result<DynamicImage> {
    let (iw, ih) = (img.width(), img.height());
    let (tw, th) = match (width, height, percent) {
        (Some(w), Some(h), _) => (w.max(1), h.max(1)),
        (Some(w), None, _) => (
            w.max(1),
            ((w as f64 * ih as f64 / iw as f64).round() as u32).max(1),
        ),
        (None, Some(h), _) => (
            ((h as f64 * iw as f64 / ih as f64).round() as u32).max(1),
            h.max(1),
        ),
        (None, None, Some(p)) => {
            let k = p as f64 / 100.0;
            (
                ((iw as f64 * k).round() as u32).max(1),
                ((ih as f64 * k).round() as u32).max(1),
            )
        }
        _ => return Ok(img),
    };
    let (tw, th) = if no_enlarge {
        (tw.min(iw).max(1), th.min(ih).max(1))
    } else {
        (tw, th)
    };
    if (tw, th) == (iw, ih) {
        return Ok(img);
    }

    match mode {
        FitMode::Stretch => fir_resize(img, tw, th),
        FitMode::Fit => {
            let k = (tw as f64 / iw as f64).min(th as f64 / ih as f64);
            let dw = ((iw as f64 * k).round() as u32).max(1);
            let dh = ((ih as f64 * k).round() as u32).max(1);
            fir_resize(img, dw, dh)
        }
        FitMode::Fill => {
            let k = (tw as f64 / iw as f64).max(th as f64 / ih as f64);
            let dw = ((iw as f64 * k).round() as u32).max(1);
            let dh = ((ih as f64 * k).round() as u32).max(1);
            let scaled = fir_resize(img, dw, dh)?;
            let x = (dw - tw) / 2;
            let y = (dh - th) / 2;
            Ok(scaled.crop_imm(x, y, tw.min(dw), th.min(dh)))
        }
    }
}

/// Resize via fast_image_resize (SIMD: NEON on both ARM targets, SSE4/AVX2 on x64).
fn fir_resize(img: DynamicImage, dw: u32, dh: u32) -> Result<DynamicImage> {
    use fast_image_resize::images::Image as FImage;
    use fast_image_resize::{FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer};

    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let src = FImage::from_vec_u8(w, h, rgba.into_raw(), PixelType::U8x4)
        .map_err(|e| StudioError::Param(format!("resize source: {e}")))?;
    let mut dst = FImage::new(dw, dh, PixelType::U8x4);
    let mut resizer = Resizer::new();
    let opts = ResizeOptions::new()
        .resize_alg(ResizeAlg::Convolution(FilterType::Lanczos3));
    resizer
        .resize(&src, &mut dst, &opts)
        .map_err(|e| StudioError::Param(format!("resize: {e}")))?;
    image::RgbaImage::from_raw(dw, dh, dst.into_vec())
        .map(DynamicImage::ImageRgba8)
        .ok_or_else(|| StudioError::Param("resized buffer size mismatch".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, RgbaImage};

    fn img(w: u32, h: u32) -> DynamicImage {
        DynamicImage::ImageRgba8(RgbaImage::new(w, h))
    }

    fn solid(color: [u8; 4]) -> DynamicImage {
        DynamicImage::ImageRgba8(RgbaImage::from_pixel(8, 8, image::Rgba(color)))
    }

    #[test]
    fn fit_preserves_aspect() {
        let out = apply_steps(
            img(1000, 500),
            &[Step::Resize {
                width: Some(200),
                height: Some(200),
                percent: None,
                mode: FitMode::Fit,
                no_enlarge: false,
            }],
        )
        .unwrap();
        assert_eq!((out.width(), out.height()), (200, 100));
    }

    #[test]
    fn fill_crops_to_exact_target() {
        let out = apply_steps(
            img(1000, 500),
            &[Step::Resize {
                width: Some(200),
                height: Some(200),
                percent: None,
                mode: FitMode::Fill,
                no_enlarge: false,
            }],
        )
        .unwrap();
        assert_eq!((out.width(), out.height()), (200, 200));
    }

    #[test]
    fn stretch_hits_exact_dims() {
        let out = apply_steps(
            img(100, 100),
            &[Step::Resize {
                width: Some(80),
                height: Some(40),
                percent: None,
                mode: FitMode::Stretch,
                no_enlarge: false,
            }],
        )
        .unwrap();
        assert_eq!((out.width(), out.height()), (80, 40));
    }

    #[test]
    fn percent_resizes_both_axes() {
        let out = apply_steps(
            img(200, 100),
            &[Step::Resize {
                width: None,
                height: None,
                percent: Some(50),
                mode: FitMode::Fit,
                no_enlarge: false,
            }],
        )
        .unwrap();
        assert_eq!((out.width(), out.height()), (100, 50));
    }

    #[test]
    fn no_enlarge_clamps() {
        let out = apply_steps(
            img(100, 50),
            &[Step::Resize {
                width: Some(400),
                height: None,
                percent: None,
                mode: FitMode::Fit,
                no_enlarge: true,
            }],
        )
        .unwrap();
        assert_eq!((out.width(), out.height()), (100, 50));
    }

    #[test]
    fn crop_clamps_to_bounds() {
        let out = apply_steps(
            img(100, 100),
            &[Step::Crop {
                x: 90,
                y: 90,
                width: 50,
                height: 50,
            }],
        )
        .unwrap();
        assert_eq!((out.width(), out.height()), (10, 10));
    }

    #[test]
    fn rotate_swaps_dims() {
        let out = apply_steps(img(100, 40), &[Step::Rotate90]).unwrap();
        assert_eq!((out.width(), out.height()), (40, 100));
    }

    #[test]
    fn adjust_zero_is_identity() {
        let img = solid([120, 60, 200, 255]);
        let out = adjust(img, 0, 0, 0).unwrap().to_rgba8();
        assert_eq!(out.get_pixel(3, 3)[0], 120);
        assert_eq!(out.get_pixel(3, 3)[2], 200);
    }

    #[test]
    fn adjust_brightness_shifts_and_clamps() {
        let img = solid([10, 128, 250, 255]);
        let out = adjust(img, 50, 0, 0).unwrap().to_rgba8();
        let px = out.get_pixel(0, 0);
        assert_eq!(px[0], 137); // 10 + 127.5
        assert_eq!(px[2], 255); // clamped
    }

    #[test]
    fn adjust_saturation_gray_keeps_luma() {
        let img = solid([200, 100, 50, 255]);
        let out = adjust(img, 0, 0, -100).unwrap().to_rgba8();
        let px = out.get_pixel(0, 0);
        // -100 = grayscale: every channel equals the luma.
        assert_eq!(px[0], px[1]);
        assert_eq!(px[1], px[2]);
    }

    #[test]
    fn mirror_horizontal_doubles_width() {
        let img = solid([10, 20, 30, 255]);
        let out = mirror(img, MirrorDir::Horizontal).unwrap().to_rgba8();
        assert_eq!(out.width(), 16);
        assert_eq!(out.height(), 8);
        // A solid color reflects onto itself — both halves identical.
        assert_eq!(out.get_pixel(3, 3), out.get_pixel(11, 3));
    }

    #[test]
    fn mirror_vertical_doubles_height() {
        let img = solid([10, 20, 30, 255]);
        let out = mirror(img, MirrorDir::Vertical).unwrap().to_rgba8();
        assert_eq!(out.width(), 8);
        assert_eq!(out.height(), 16);
    }

    #[test]
    fn adjust_contrast_extremes() {
        let img = solid([128, 10, 240, 255]);
        let out = adjust(img, 0, 100, 0).unwrap().to_rgba8();
        let px = out.get_pixel(0, 0);
        assert_eq!(px[1], 0); // far below midpoint → 0
        assert_eq!(px[2], 255); // far above → 255
    }

}
