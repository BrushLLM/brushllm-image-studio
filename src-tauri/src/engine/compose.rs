//! Alpha-compose a watermark overlay (same-size RGBA PNG) onto a base image.

use image::{DynamicImage, GenericImageView, RgbaImage};

use super::{Result, StudioError};

/// Standard source-over blend of `overlay` onto `base`. Dimensions must match.
pub fn compose(base: DynamicImage, overlay: RgbaImage) -> Result<DynamicImage> {
    if base.dimensions() != overlay.dimensions() {
        return Err(StudioError::Param(format!(
            "overlay size {}x{} does not match image size {}x{}",
            overlay.width(),
            overlay.height(),
            base.width(),
            base.height()
        )));
    }
    let mut out = base.to_rgba8();
    for (base_px, overlay_px) in out.pixels_mut().zip(overlay.pixels()) {
        let a = overlay_px[3] as u32;
        if a == 0 {
            continue;
        }
        if a == 255 {
            *base_px = *overlay_px;
            continue;
        }
        let b = *base_px;
        let out_a = a + (b[3] as u32 * (255 - a)) / 255;
        if out_a == 0 {
            continue;
        }
        let blend = |bc: u8, oc: u8| -> u8 {
            let b_premul = bc as u32 * b[3] as u32;
            let mixed = oc as u32 * a * 255 + b_premul * (255 - a);
            (mixed / (255 * out_a)).min(255) as u8
        };
        *base_px = image::Rgba([
            blend(b[0], overlay_px[0]),
            blend(b[1], overlay_px[1]),
            blend(b[2], overlay_px[2]),
            out_a as u8,
        ]);
    }
    Ok(DynamicImage::ImageRgba8(out))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;
    #[test]
    fn full_opacity_overlay_replaces() {
        let base = DynamicImage::ImageRgba8(RgbaImage::from_pixel(4, 4, Rgba([10, 10, 10, 255])));
        let mut overlay = RgbaImage::new(4, 4);
        overlay.put_pixel(0, 0, Rgba([200, 100, 50, 255]));
        let out = compose(base, overlay).unwrap().to_rgba8();
        assert_eq!(*out.get_pixel(0, 0), Rgba([200, 100, 50, 255]));
        assert_eq!(*out.get_pixel(1, 1), Rgba([10, 10, 10, 255]));
    }

    #[test]
    fn half_opacity_blends() {
        let base = DynamicImage::ImageRgba8(RgbaImage::from_pixel(2, 2, Rgba([0, 0, 0, 255])));
        let mut overlay = RgbaImage::new(2, 2);
        overlay.put_pixel(0, 0, Rgba([100, 100, 100, 128])); // ~50% alpha
        let out = compose(base, overlay).unwrap().to_rgba8();
        let px = out.get_pixel(0, 0);
        assert!((px[0] as i32 - 50).abs() <= 1, "got {px:?}");
    }

    #[test]
    fn mismatched_size_errors() {
        let base = DynamicImage::ImageRgba8(RgbaImage::new(4, 4));
        let overlay = RgbaImage::new(8, 8);
        assert!(compose(base, overlay).is_err());
    }
}
