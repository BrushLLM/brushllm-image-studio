//! EXIF handling. Re-encoding always drops metadata; for JPEG output we can
//! re-insert the original EXIF block as an APP1 segment right after SOI.

/// Extract the raw EXIF block (with `Exif\0\0` header, i.e. the full APP1
/// payload) from a JPEG buffer. This is a raw copy — nothing is re-serialized.
pub fn extract_exif_jpeg(bytes: &[u8]) -> Option<Vec<u8>> {
    let tiff = exif::get_exif_attr_from_jpeg(&mut std::io::Cursor::new(bytes)).ok()?;
    let mut block = b"Exif\x00\x00".to_vec();
    block.extend_from_slice(&tiff);
    Some(block)
}

/// Insert an EXIF APP1 segment into a JPEG buffer (right after the SOI marker).
/// Silently skips if the segment would not fit the 64 KiB APP1 limit.
pub fn insert_exif_jpeg(jpeg: &mut Vec<u8>, exif: &[u8]) {
    if jpeg.len() < 2 || jpeg[0] != 0xFF || jpeg[1] != 0xD8 {
        return;
    }
    if exif.is_empty() || exif.len() + 2 > 0xFFFF {
        return;
    }
    let mut app1 = Vec::with_capacity(4 + exif.len());
    app1.extend_from_slice(&[0xFF, 0xE1]);
    app1.extend_from_slice(&((exif.len() + 2) as u16).to_be_bytes());
    app1.extend_from_slice(exif);

    let mut out = Vec::with_capacity(jpeg.len() + app1.len());
    out.extend_from_slice(&jpeg[..2]);
    out.extend_from_slice(&app1);
    out.extend_from_slice(&jpeg[2..]);
    *jpeg = out;
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, RgbaImage};

    fn exif_tiff_block() -> Vec<u8> {
        // Build a minimal TIFF EXIF with one tag (ImageWidth = 16).
        let field = exif::Field {
            tag: exif::Tag::ImageWidth,
            ifd_num: exif::In::PRIMARY,
            value: exif::Value::Short(vec![16]),
        };
        let mut writer = exif::experimental::Writer::new();
        writer.push_field(&field);
        let mut tiff = Vec::new();
        writer
            .write(&mut std::io::Cursor::new(&mut tiff), true)
            .unwrap();
        tiff
    }

    #[test]
    fn exif_insert_then_extract_roundtrip() {
        let mut plain_buf = Vec::new();
        DynamicImage::ImageRgba8(RgbaImage::new(16, 16))
            .write_to(
                &mut std::io::Cursor::new(&mut plain_buf),
                image::ImageFormat::Jpeg,
            )
            .unwrap();

        let tiff = exif_tiff_block();
        let mut exif_block = b"Exif\x00\x00".to_vec();
        exif_block.extend_from_slice(&tiff);

        let mut jpeg = plain_buf;
        insert_exif_jpeg(&mut jpeg, &exif_block);
        assert_eq!(&jpeg[2..4], &[0xFF, 0xE1], "APP1 must follow SOI");

        let extracted = extract_exif_jpeg(&jpeg).expect("exif should be extractable");
        assert_eq!(extracted, exif_block);
        // The doctored JPEG must still decode.
        image::load_from_memory(&jpeg).unwrap();
    }

    #[test]
    fn jpeg_without_exif_extracts_none() {
        let mut plain_buf = Vec::new();
        DynamicImage::ImageRgba8(RgbaImage::new(8, 8))
            .write_to(
                &mut std::io::Cursor::new(&mut plain_buf),
                image::ImageFormat::Jpeg,
            )
            .unwrap();
        assert!(extract_exif_jpeg(&plain_buf).is_none());
    }
}
