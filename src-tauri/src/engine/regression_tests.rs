use super::*;
use std::{borrow::Cow, io::Cursor};

fn jpeg(orientation: u16, little: bool) -> Vec<u8> {
    let img = image::DynamicImage::ImageRgb8(image::RgbImage::from_fn(60, 40, |x, y| {
        image::Rgb([(x * 4) as u8, (y * 6) as u8, ((x * 13 + y * 7) % 256) as u8])
    }));
    let mut bytes = encode::encode(
        &img,
        &encode::EncodeSettings {
            format: encode::OutFormat::Jpeg,
            quality: 10,
        },
    )
    .unwrap();
    let fields = [
        exif::Field {
            tag: exif::Tag::Orientation,
            ifd_num: exif::In::PRIMARY,
            value: exif::Value::Short(vec![orientation]),
        },
        exif::Field {
            tag: exif::Tag::Artist,
            ifd_num: exif::In::PRIMARY,
            value: exif::Value::Ascii(vec![b"Test artist".to_vec()]),
        },
    ];
    let mut writer = exif::experimental::Writer::new();
    for field in &fields {
        writer.push_field(field);
    }
    let mut tiff = Cursor::new(Vec::new());
    writer.write(&mut tiff, little).unwrap();
    let mut block = b"Exif\0\0".to_vec();
    block.extend(tiff.into_inner());
    metadata::insert_exif_jpeg(&mut bytes, &block);
    bytes
}

#[test]
fn all_exif_orientations_match_the_displayed_pixels() {
    for little in [true, false] {
        for orientation in 1..=8 {
            let bytes = jpeg(orientation, little);
            let mut expected = image::load_from_memory(&bytes).unwrap();
            expected.apply_orientation(
                image::metadata::Orientation::from_exif(orientation as u8).unwrap(),
            );
            let actual = decode::decode_bytes(&bytes).unwrap();
            assert_eq!(actual.to_rgba8(), expected.to_rgba8());
            assert_eq!(
                decode::dimensions(&bytes).unwrap(),
                (actual.width(), actual.height())
            );
            let normalized = metadata::normalized_exif_jpeg(&bytes).unwrap();
            let exif = exif::Reader::new()
                .read_raw(normalized[6..].to_vec())
                .unwrap();
            assert_eq!(
                exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
                    .unwrap()
                    .value
                    .get_uint(0),
                Some(1)
            );
            assert!(exif
                .get_field(exif::Tag::Artist, exif::In::PRIMARY)
                .is_some());
        }
    }
}

#[test]
fn export_matches_preview_when_stripping_metadata_would_grow_a_jpeg() {
    let dir = std::env::temp_dir().join(format!("studio-render-regression-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("source.jpg");
    let bytes = jpeg(6, true);
    std::fs::write(&path, &bytes).unwrap();
    let img = decode::decode_bytes(&bytes).unwrap();
    let settings = batch::RenderSettings {
        steps: &[],
        format: Some(encode::OutFormat::Jpeg),
        quality: 100,
        preserve_exif: false,
    };
    let (_, preview) = batch::render(
        path.to_str().unwrap(),
        &bytes,
        Cow::Borrowed(&img),
        &settings,
    )
    .unwrap();
    assert!(preview.len() > bytes.len());
    assert!(metadata::extract_exif_jpeg(&preview).is_none());
    let job = batch::BatchJob {
        files: vec![path.to_string_lossy().into_owned()],
        steps: vec![],
        format: Some(encode::OutFormat::Jpeg),
        quality: 100,
        preserve_exif: false,
        output: batch::OutputSettings {
            dir: Some(dir.to_string_lossy().into_owned()),
            suffix: "-export".into(),
            collision: batch::Collision::Overwrite,
        },
    };
    let report = batch::run(job, None, |_, _, _| {});
    assert_eq!(report.ok, 1);
    let exported = std::fs::read(report.items[0].output_path.as_ref().unwrap()).unwrap();
    assert_eq!(exported, preview);
    let output = decode::decode_bytes(&exported).unwrap();
    assert_eq!((output.width(), output.height()), (40, 60));
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn edited_jpeg_preserves_metadata_without_rotating_twice() {
    let bytes = jpeg(6, false);
    let img = decode::decode_bytes(&bytes).unwrap();
    let settings = batch::RenderSettings {
        steps: &[ops::Step::Rotate90],
        format: Some(encode::OutFormat::Jpeg),
        quality: 90,
        preserve_exif: true,
    };
    let (_, output) = batch::render("source.jpg", &bytes, Cow::Owned(img), &settings).unwrap();
    let decoded = decode::decode_bytes(&output).unwrap();
    assert_eq!((decoded.width(), decoded.height()), (60, 40));
    let exif = exif::Reader::new()
        .read_from_container(&mut Cursor::new(&output))
        .unwrap();
    assert_eq!(
        exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
            .unwrap()
            .value
            .get_uint(0),
        Some(1)
    );
    assert!(exif
        .get_field(exif::Tag::Artist, exif::In::PRIMARY)
        .is_some());
}

fn png_header(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    for (kind, data) in [
        (
            b"IHDR",
            [
                width.to_be_bytes().as_slice(),
                height.to_be_bytes().as_slice(),
                &[8, 2, 0, 0, 0],
            ]
            .concat(),
        ),
        (b"IDAT", vec![]),
        (b"IEND", vec![]),
    ] {
        bytes.extend((data.len() as u32).to_be_bytes());
        bytes.extend(kind);
        bytes.extend(&data);
        let mut crc = crc32fast::Hasher::new();
        crc.update(kind);
        crc.update(&data);
        bytes.extend(crc.finalize().to_be_bytes());
    }
    bytes
}

#[test]
fn oversized_raster_is_rejected_before_decoding_pixel_data() {
    let error = decode::decode_bytes(&png_header(10_000, 10_000))
        .unwrap_err()
        .to_string();
    assert!(error.contains("megapixels"), "{error}");
}

#[test]
fn stitch_checks_combined_input_headers_before_decoding() {
    let dir = std::env::temp_dir().join(format!("studio-stitch-budget-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("header.png");
    std::fs::write(&path, png_header(5_000, 5_000)).unwrap();
    let files = vec![path.to_string_lossy().into_owned(); 3];
    let opts = stitch::StitchOpts {
        direction: stitch::Direction::Vertical,
        spacing: 0,
        align: stitch::Align::Center,
        background: "#ffffff".into(),
        normalize: stitch::Normalize::First,
    };
    let error = stitch::from_files(&files, &opts).unwrap_err().to_string();
    assert!(error.contains("combined stitch inputs"), "{error}");
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn preview_cache_reuses_decoding_and_invalidates_modified_files() {
    let dir = std::env::temp_dir().join(format!("studio-cache-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("source.bmp");
    let write = |width| {
        let img = image::DynamicImage::ImageRgb8(image::RgbImage::new(width, 8));
        let data = encode::encode(
            &img,
            &encode::EncodeSettings {
                format: encode::OutFormat::Bmp,
                quality: 75,
            },
        )
        .unwrap();
        std::fs::write(&path, data).unwrap();
    };
    write(8);
    let first = preview::load(&path).unwrap();
    let again = preview::load(&path).unwrap();
    assert!(std::sync::Arc::ptr_eq(&first, &again));
    write(16);
    let updated = preview::load(&path).unwrap();
    assert!(!std::sync::Arc::ptr_eq(&first, &updated));
    assert_eq!(updated.image.width(), 16);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn transparent_stitch_inputs_use_the_selected_background() {
    let opts = stitch::StitchOpts {
        direction: stitch::Direction::Vertical,
        spacing: 0,
        align: stitch::Align::Center,
        background: "#ff0000".into(),
        normalize: stitch::Normalize::First,
    };
    let img = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
        2,
        2,
        image::Rgba([0, 255, 0, 0]),
    ));
    let result = stitch::stitch(vec![img], &opts).unwrap().to_rgba8();
    assert_eq!(result.get_pixel(0, 0).0, [255, 0, 0, 255]);
}
