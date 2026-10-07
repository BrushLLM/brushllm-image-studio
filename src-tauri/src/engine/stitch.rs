//! Stitch multiple images into one long image (vertical or horizontal).

use image::{DynamicImage, GenericImage};
use serde::Deserialize;

use super::{Result, StudioError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    Vertical,
    Horizontal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Align {
    Start,
    Center,
    End,
}

/// Which cross-dimension all images are normalized to before stitching.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Normalize {
    First,
    Max,
    Min,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StitchOpts {
    pub direction: Direction,
    pub spacing: u32,
    pub align: Align,
    /// "#RRGGBB"
    pub background: String,
    pub normalize: Normalize,
}

pub fn stitch(images: Vec<DynamicImage>, opts: &StitchOpts) -> Result<DynamicImage> {
    if images.is_empty() {
        return Err(StudioError::Param("no images to stitch".into()));
    }
    let cross: Vec<u32> = if opts.direction == Direction::Vertical {
        images.iter().map(|i| i.width()).collect()
    } else {
        images.iter().map(|i| i.height()).collect()
    };
    let target = match opts.normalize {
        Normalize::First => cross[0],
        Normalize::Max => *cross.iter().max().unwrap(),
        Normalize::Min => *cross.iter().min().unwrap(),
    }
    .max(1);

    let mut scaled: Vec<DynamicImage> = Vec::with_capacity(images.len());
    for img in images {
        let scaled_img = match opts.direction {
            Direction::Vertical => {
                if img.width() == target {
                    img
                } else {
                    let h = ((img.height() as f64 * target as f64 / img.width() as f64).round()
                        as u32)
                        .max(1);
                    // Max normalization can upscale a small image up to the
                    // largest cross dimension — the scaled result may exceed
                    // the pixel budget, so check before resize_exact.
                    super::guard::validate_pixels(target as u64, h as u64, "stitched image")?;
                    img.resize_exact(target, h, image::imageops::FilterType::Lanczos3)
                }
            }
            Direction::Horizontal => {
                if img.height() == target {
                    img
                } else {
                    let w = ((img.width() as f64 * target as f64 / img.height() as f64).round()
                        as u32)
                        .max(1);
                    super::guard::validate_pixels(w as u64, target as u64, "stitched image")?;
                    img.resize_exact(w, target, image::imageops::FilterType::Lanczos3)
                }
            }
        };
        scaled.push(scaled_img);
    }

    let bg = parse_hex(&opts.background).unwrap_or([255, 255, 255]);
    let count = scaled.len() as u64;
    // Accumulate in u64 so heights/widths and spacing cannot wrap, then
    // enforce both the u32 canvas limit and the pixel budget before
    // allocating the canvas.
    let (out_w, out_h): (u64, u64) = match opts.direction {
        Direction::Vertical => {
            let w = scaled.iter().map(|i| i.width()).max().unwrap() as u64;
            let h = scaled.iter().map(|i| i.height() as u64).sum::<u64>()
                + opts.spacing as u64 * (count - 1);
            (w, h)
        }
        Direction::Horizontal => {
            let h = scaled.iter().map(|i| i.height()).max().unwrap() as u64;
            let w = scaled.iter().map(|i| i.width() as u64).sum::<u64>()
                + opts.spacing as u64 * (count - 1);
            (w, h)
        }
    };
    if out_w > u32::MAX as u64 || out_h > u32::MAX as u64 {
        return Err(StudioError::Param(
            "stitched image dimensions overflow".into(),
        ));
    }
    super::guard::validate_pixels(out_w, out_h, "stitched image")?;
    let (out_w, out_h) = (out_w as u32, out_h as u32);

    let mut canvas =
        image::RgbaImage::from_pixel(out_w, out_h, image::Rgba([bg[0], bg[1], bg[2], 255]));
    let mut offset = 0u32;
    for img in scaled {
        let rgba = img.to_rgba8();
        let (x, y) = match opts.direction {
            Direction::Vertical => {
                let x = match opts.align {
                    Align::Start => 0,
                    Align::Center => (out_w - rgba.width()) / 2,
                    Align::End => out_w - rgba.width(),
                };
                let y = offset;
                offset = offset.saturating_add(rgba.height().saturating_add(opts.spacing));
                (x, y)
            }
            Direction::Horizontal => {
                let y = match opts.align {
                    Align::Start => 0,
                    Align::Center => (out_h - rgba.height()) / 2,
                    Align::End => out_h - rgba.height(),
                };
                let x = offset;
                offset = offset.saturating_add(rgba.width().saturating_add(opts.spacing));
                (x, y)
            }
        };
        canvas
            .copy_from(&rgba, x, y)
            .map_err(|e| StudioError::Param(format!("stitch paste: {e}")))?;
    }
    Ok(DynamicImage::ImageRgba8(canvas))
}

fn parse_hex(hex: &str) -> Option<[u8; 3]> {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }
    let v = u32::from_str_radix(hex, 16).ok()?;
    Some([(v >> 16) as u8, ((v >> 8) & 0xFF) as u8, (v & 0xFF) as u8])
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, GenericImageView, RgbaImage};

    fn img(w: u32, h: u32) -> DynamicImage {
        DynamicImage::ImageRgba8(RgbaImage::new(w, h))
    }

    fn opts(direction: Direction, spacing: u32, align: Align) -> StitchOpts {
        StitchOpts {
            direction,
            spacing,
            align,
            background: "#ffffff".into(),
            normalize: Normalize::First,
        }
    }

    #[test]
    fn vertical_stitch_sizes_and_spacing() {
        let out = stitch(
            vec![img(100, 50), img(100, 70)],
            &opts(Direction::Vertical, 10, Align::Start),
        )
        .unwrap();
        assert_eq!(out.dimensions(), (100, 130)); // 50 + 10 + 70
    }

    #[test]
    fn horizontal_stitch_with_align_center() {
        let out = stitch(
            vec![img(100, 50), img(60, 50)],
            &opts(Direction::Horizontal, 0, Align::Center),
        )
        .unwrap();
        assert_eq!(out.dimensions(), (160, 50));
    }

    #[test]
    fn vertical_normalizes_width_to_first() {
        let out = stitch(
            vec![img(100, 100), img(200, 100)],
            &opts(Direction::Vertical, 0, Align::Start),
        )
        .unwrap();
        // Second image is scaled from 200 wide down to 100 → height 50.
        assert_eq!(out.dimensions(), (100, 150));
    }

    #[test]
    fn spacing_overflow_errors_not_panics() {
        // 1 + 1 + u32::MAX spacing exceeds any u32 canvas height — must be
        // a Param error, not a panic.
        let out = stitch(
            vec![img(1, 1), img(1, 1)],
            &opts(Direction::Vertical, u32::MAX, Align::Start),
        );
        assert!(matches!(out, Err(StudioError::Param(_))));
    }

    #[test]
    fn total_pixels_over_budget_errors() {
        // Two 8000x8000 images (64 MP each, within the per-image budget)
        // stacked vertically = 8000x16000 = 128 MP — over the budget.
        let out = stitch(
            vec![img(8000, 8000), img(8000, 8000)],
            &opts(Direction::Vertical, 0, Align::Start),
        );
        assert!(matches!(out, Err(StudioError::Param(_))));
    }
}
