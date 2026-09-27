//! EXIF view / strip / edit. JPEG segments are rewritten losslessly (no
//! re-encode); PNG eXIf chunks are read/replaced/dropped in place (with fresh
//! CRCs). Field editing rebuilds the EXIF block with kamadak-exif.

use std::io::Cursor;

use serde::{Deserialize, Serialize};

use super::metadata;
use super::{Result, StudioError};

const EXIF_HEADER: &[u8] = b"Exif\x00\x00";
const XMP_PREFIX: &[u8] = b"http://ns.adobe.com/xap/";
const PS13_PREFIX: &[u8] = b"Photoshop 3.0";
const PNG_SIG: &[u8] = b"\x89PNG\r\n\x1a\n";

#[derive(Debug, Clone, Serialize)]
pub struct FieldInfo {
    pub tag: String,
    pub group: String,
    /// Human-readable rendering.
    pub value: String,
    pub is_gps: bool,
    /// Prefill value for the edit form (unquoted text, ISO dates, decimal GPS).
    pub edit_value: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ExifEdits {
    /// "YYYY-MM-DD HH:MM:SS" or already-EXIF "YYYY:MM:DD HH:MM:SS".
    pub date_time: Option<String>,
    pub make: Option<String>,
    pub model: Option<String>,
    /// Decimal degrees, e.g. "31.2304" / "-118.4912".
    pub gps_lat: Option<String>,
    pub gps_lon: Option<String>,
    pub description: Option<String>,
    pub artist: Option<String>,
    pub copyright: Option<String>,
}

impl ExifEdits {
    pub fn is_empty(&self) -> bool {
        nonempty(&self.date_time).is_none()
            && nonempty(&self.make).is_none()
            && nonempty(&self.model).is_none()
            && nonempty(&self.gps_lat).is_none()
            && nonempty(&self.gps_lon).is_none()
            && nonempty(&self.description).is_none()
            && nonempty(&self.artist).is_none()
            && nonempty(&self.copyright).is_none()
    }
}

fn nonempty(value: &Option<String>) -> Option<&str> {
    value
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(str::trim)
}

fn ascii(value: &str) -> exif::Value {
    exif::Value::Ascii(vec![value.as_bytes().to_vec()])
}

// ---------------- reading ----------------

pub fn read_fields(container: &[u8]) -> Result<Vec<FieldInfo>> {
    let reader = exif::Reader::new();
    let exif_data = reader
        .read_from_container(&mut Cursor::new(container))
        .map_err(|e| StudioError::Param(format!("cannot read EXIF: {e}")))?;
    let lat_dec = gps_decimal(&exif_data, exif::Tag::GPSLatitude, b'S');
    let lon_dec = gps_decimal(&exif_data, exif::Tag::GPSLongitude, b'W');
    Ok(exif_data
        .fields()
        .map(|f| {
            let edit_value = match f.tag {
                exif::Tag::DateTime | exif::Tag::DateTimeOriginal => match &f.value {
                    exif::Value::Ascii(v) => v
                        .first()
                        .map(|raw| {
                            String::from_utf8_lossy(raw)
                                .replace(
                                    |c: char| c == ':' && raw.starts_with(
                                        // only the date separators, not time
                                        &raw[..4].to_vec(),
                                    ) && false,
                                    "-",
                                )
                                .to_string()
                        })
                        .map(|s| {
                            // "2024:05:06 07:08:09" → "2024-05-06 07:08:09"
                            let bytes = s.as_bytes();
                            if bytes.len() == 19 && bytes[4] == b':' {
                                format!(
                                    "{}-{}-{}",
                                    &s[..4],
                                    &s[5..7],
                                    &s[8..]
                                )
                            } else {
                                s
                            }
                        }),
                    _ => None,
                },
                exif::Tag::GPSLatitude => lat_dec.map(|v| format!("{v}")),
                exif::Tag::GPSLongitude => lon_dec.map(|v| format!("{v}")),
                _ => match &f.value {
                    exif::Value::Ascii(v) => v
                        .first()
                        .map(|raw| String::from_utf8_lossy(raw).to_string()),
                    _ => None,
                },
            };
            FieldInfo {
                tag: f.tag.to_string(),
                group: f.ifd_num.to_string(),
                value: f.value.display_as(f.tag).to_string(),
                is_gps: f.tag.context() == exif::Context::Gps,
                edit_value,
            }
        })
        .collect())
}

/// Decimal degrees for a GPS coordinate, sign-corrected via its Ref field.
fn gps_decimal(
    exif_data: &exif::Exif,
    coord_tag: exif::Tag,
    negative_ref: u8,
) -> Option<f64> {
    let fields: Vec<&exif::Field> = exif_data.fields().collect();
    let coord = fields.iter().find(|f| f.tag == coord_tag)?;
    let ref_tag = if coord_tag == exif::Tag::GPSLatitude {
        exif::Tag::GPSLatitudeRef
    } else {
        exif::Tag::GPSLongitudeRef
    };
    let ref_value = fields
        .iter()
        .find(|f| f.tag == ref_tag)
        .and_then(|f| match &f.value {
            exif::Value::Ascii(v) => v.first().and_then(|s| s.first().copied()),
            _ => None,
        });

    let rationals = match &coord.value {
        exif::Value::Rational(v) if v.len() >= 3 => v,
        _ => return None,
    };
    let to_f = |r: &exif::Rational| -> f64 {
        if r.denom == 0 {
            0.0
        } else {
            r.num as f64 / r.denom as f64
        }
    };
    let mut decimal =
        to_f(&rationals[0]) + to_f(&rationals[1]) / 60.0 + to_f(&rationals[2]) / 3600.0;
    if ref_value == Some(negative_ref) {
        decimal = -decimal;
    }
    Some(decimal)
}

// ---------------- shared edit transform ----------------

fn parse_gps(value: &str, max_abs: f64) -> Result<f64> {
    let trimmed = value
        .trim()
        .trim_end_matches(['N', 'S', 'E', 'W', 'n', 's', 'e', 'w'])
        .trim();
    let parsed: f64 = trimmed
        .parse()
        .map_err(|_| StudioError::Param(format!("invalid GPS coordinate: {value}")))?;
    if parsed.abs() > max_abs {
        return Err(StudioError::Param(format!(
            "GPS coordinate out of range: {value} (max ±{max_abs})"
        )));
    }
    Ok(parsed)
}

fn to_dms(value: f64) -> (u32, u32, f64) {
    let deg = value.floor();
    let minutes_total = (value - deg) * 60.0;
    let min = minutes_total.floor();
    let sec = (minutes_total - min) * 60.0;
    (deg as u32, min as u32, sec)
}

fn gps_rational(value: f64) -> Vec<exif::Rational> {
    let (deg, min, sec) = to_dms(value.abs());
    vec![
        exif::Rational { num: deg, denom: 1 },
        exif::Rational { num: min, denom: 1 },
        exif::Rational {
            num: (sec * 10_000.0).round() as u32,
            denom: 10_000,
        },
    ]
}

/// Shared field transform for JPEG and PNG: optionally drop GPS, upsert edits.
fn apply_edits(
    mut fields: Vec<exif::Field>,
    edits: &ExifEdits,
    strip_gps: bool,
) -> Result<Vec<exif::Field>> {
    if strip_gps {
        fields.retain(|f| f.tag.context() != exif::Context::Gps);
    }

    if let Some(date) = nonempty(&edits.date_time) {
        let normalized = normalize_date(date)?;
        fields.upsert(
            exif::Tag::DateTimeOriginal,
            exif::Value::Ascii(vec![normalized.clone().into_bytes()]),
        );
        fields.upsert(
            exif::Tag::DateTime,
            exif::Value::Ascii(vec![normalized.into_bytes()]),
        );
    }
    if let Some(v) = nonempty(&edits.make) {
        fields.upsert(exif::Tag::Make, ascii(v));
    }
    if let Some(v) = nonempty(&edits.model) {
        fields.upsert(exif::Tag::Model, ascii(v));
    }
    if let Some(v) = nonempty(&edits.description) {
        fields.upsert(exif::Tag::ImageDescription, ascii(v));
    }
    if let Some(v) = nonempty(&edits.artist) {
        fields.upsert(exif::Tag::Artist, ascii(v));
    }
    if let Some(v) = nonempty(&edits.copyright) {
        fields.upsert(exif::Tag::Copyright, ascii(v));
    }

    let lat = match nonempty(&edits.gps_lat) {
        Some(v) => Some(parse_gps(v, 90.0)?),
        None => None,
    };
    let lon = match nonempty(&edits.gps_lon) {
        Some(v) => Some(parse_gps(v, 180.0)?),
        None => None,
    };
    if lat.is_some() || lon.is_some() {
        if !fields.iter().any(|f| f.tag == exif::Tag::GPSVersionID) {
            fields.push(exif::Field {
                tag: exif::Tag::GPSVersionID,
                ifd_num: exif::In::PRIMARY,
                value: exif::Value::Byte(vec![2, 3, 0, 0]),
            });
        }
    }
    if let Some(lat) = lat {
        fields.upsert(
            exif::Tag::GPSLatitudeRef,
            exif::Value::Ascii(vec![vec![if lat >= 0.0 { b'N' } else { b'S' }]]),
        );
        fields.upsert(
            exif::Tag::GPSLatitude,
            exif::Value::Rational(gps_rational(lat)),
        );
    }
    if let Some(lon) = lon {
        fields.upsert(
            exif::Tag::GPSLongitudeRef,
            exif::Value::Ascii(vec![vec![if lon >= 0.0 { b'E' } else { b'W' }]]),
        );
        fields.upsert(
            exif::Tag::GPSLongitude,
            exif::Value::Rational(gps_rational(lon)),
        );
    }
    Ok(fields)
}

fn build_tiff(fields: &[exif::Field]) -> Result<Vec<u8>> {
    let mut writer = exif::experimental::Writer::new();
    for field in fields {
        writer.push_field(field);
    }
    let mut tiff = Vec::new();
    writer
        .write(&mut Cursor::new(&mut tiff), true)
        .map_err(|e| StudioError::Param(format!("cannot rebuild EXIF: {e}")))?;
    Ok(tiff)
}

trait UpsertExt {
    fn upsert(&mut self, tag: exif::Tag, value: exif::Value);
}

impl UpsertExt for Vec<exif::Field> {
    fn upsert(&mut self, tag: exif::Tag, value: exif::Value) {
        // The experimental Writer regroups fields into IFDs by tag context,
        // so PRIMARY is the right slot for all editable tags here.
        let ifd_num = exif::In::PRIMARY;
        if let Some(existing) = self.iter_mut().find(|f| f.tag == tag) {
            existing.value = value;
        } else {
            self.push(exif::Field { tag, ifd_num, value });
        }
    }
}

/// Accept "YYYY-MM-DD HH:MM:SS" or EXIF "YYYY:MM:DD HH:MM:SS".
fn normalize_date(input: &str) -> Result<String> {
    let normalized = if input.len() == 19 && input.as_bytes().get(4) == Some(&b'-') {
        let mut chars = input.chars().collect::<Vec<_>>();
        chars[4] = ':';
        chars[7] = ':';
        chars.into_iter().collect()
    } else {
        input.to_string()
    };
    if exif::DateTime::from_ascii(normalized.as_bytes()).is_err() {
        return Err(StudioError::Param(
            "invalid date — use YYYY-MM-DD HH:MM:SS".into(),
        ));
    }
    Ok(normalized)
}

// ---------------- JPEG ----------------

/// Remove EXIF/XMP/IPTC/COM segments from a JPEG without re-encoding.
pub fn jpeg_strip_metadata(input: &[u8]) -> Result<Vec<u8>> {
    if input.len() < 4 || input[0] != 0xFF || input[1] != 0xD8 {
        return Err(StudioError::Param("not a JPEG file".into()));
    }
    let mut out = vec![0xFF, 0xD8];
    let mut pos = 2;
    while pos < input.len() {
        if input[pos] != 0xFF {
            return Err(StudioError::Param("corrupt JPEG: expected marker".into()));
        }
        let mut m = pos + 1;
        while m < input.len() && input[m] == 0xFF {
            m += 1;
        }
        let marker = *input
            .get(m)
            .ok_or_else(|| StudioError::Param("truncated JPEG".into()))?;

        // Standalone markers without a length field.
        if marker == 0x01 || (0xD0..=0xD7).contains(&marker) {
            out.extend_from_slice(&input[pos..=m]);
            pos = m + 1;
            continue;
        }
        if marker == 0xD9 {
            out.extend_from_slice(&input[pos..=m]);
            pos = m + 1;
            break;
        }
        if marker == 0xDA {
            // Start of scan: everything from here is entropy-coded data.
            out.extend_from_slice(&input[pos..]);
            return Ok(out);
        }

        let len_pos = m + 1;
        let seg_len = u16::from_be_bytes([
            *input
                .get(len_pos)
                .ok_or_else(|| StudioError::Param("truncated JPEG".into()))?,
            *input
                .get(len_pos + 1)
                .ok_or_else(|| StudioError::Param("truncated JPEG".into()))?,
        ]) as usize;
        if seg_len < 2 {
            return Err(StudioError::Param("corrupt JPEG: bad segment length".into()));
        }
        let seg_end = len_pos + seg_len;
        if seg_end > input.len() {
            return Err(StudioError::Param("truncated JPEG".into()));
        }
        let payload = &input[len_pos + 2..seg_end];
        let drop = match marker {
            0xE1 => payload.starts_with(EXIF_HEADER) || payload.starts_with(XMP_PREFIX),
            0xED => payload.starts_with(PS13_PREFIX),
            0xFE => true, // comment
            _ => false,
        };
        if !drop {
            out.extend_from_slice(&input[pos..seg_end]);
        }
        pos = seg_end;
    }
    if pos < input.len() {
        out.extend_from_slice(&input[pos..]);
    }
    Ok(out)
}

/// Replace the EXIF APP1 segment of a JPEG with `exif_block` ("Exif\0\0" + TIFF).
pub fn jpeg_replace_exif(input: &[u8], exif_block: &[u8]) -> Result<Vec<u8>> {
    let mut out = jpeg_strip_metadata(input)?;
    metadata::insert_exif_jpeg(&mut out, exif_block);
    Ok(out)
}

/// Apply edits (and optionally drop GPS fields) to a JPEG's EXIF.
pub fn jpeg_edit_exif(input: &[u8], edits: &ExifEdits, strip_gps: bool) -> Result<Vec<u8>> {
    let fields: Vec<exif::Field> = match exif::Reader::new()
        .read_from_container(&mut Cursor::new(input))
    {
        Ok(exif_data) => exif_data.fields().cloned().collect(),
        // No readable EXIF: start from scratch so edits can still add fields.
        Err(_) => Vec::new(),
    };

    let fields = apply_edits(fields, edits, strip_gps)?;
    if fields.is_empty() {
        return jpeg_strip_metadata(input);
    }

    let mut block = EXIF_HEADER.to_vec();
    block.extend_from_slice(&build_tiff(&fields)?);
    jpeg_replace_exif(input, &block)
}

// ---------------- PNG ----------------

/// Remove metadata chunks (tEXt/zTXt/iTXt/eXIf) from a PNG without re-encoding.
pub fn png_strip_metadata(input: &[u8]) -> Result<Vec<u8>> {
    if input.len() < 8 || &input[0..8] != PNG_SIG {
        return Err(StudioError::Param("not a PNG file".into()));
    }
    let mut out = PNG_SIG.to_vec();
    let mut pos = 8;
    while pos + 8 <= input.len() {
        let len = u32::from_be_bytes([
            input[pos],
            input[pos + 1],
            input[pos + 2],
            input[pos + 3],
        ]) as usize;
        let chunk_type = &input[pos + 4..pos + 8];
        let total = 12 + len;
        if pos + total > input.len() {
            return Err(StudioError::Param("truncated PNG".into()));
        }
        match chunk_type {
            b"tEXt" | b"zTXt" | b"iTXt" | b"eXIf" => {}
            _ => out.extend_from_slice(&input[pos..pos + total]),
        }
        let is_iend = chunk_type == b"IEND";
        pos += total;
        if is_iend {
            break;
        }
    }
    if pos < input.len() {
        out.extend_from_slice(&input[pos..]);
    }
    Ok(out)
}

fn exif_chunk(tiff: &[u8]) -> Vec<u8> {
    let mut chunk = Vec::with_capacity(12 + tiff.len());
    chunk.extend_from_slice(&(tiff.len() as u32).to_be_bytes());
    chunk.extend_from_slice(b"eXIf");
    chunk.extend_from_slice(tiff);
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(b"eXIf");
    hasher.update(tiff);
    chunk.extend_from_slice(&hasher.finalize().to_be_bytes());
    chunk
}

/// Apply edits (and optionally drop GPS) to a PNG's eXIf chunk.
pub fn png_edit_exif(input: &[u8], edits: &ExifEdits, strip_gps: bool) -> Result<Vec<u8>> {
    if input.len() < 8 || &input[0..8] != PNG_SIG {
        return Err(StudioError::Param("not a PNG file".into()));
    }

    // First pass: find the eXIf chunk and read its fields.
    let mut existing: Option<Vec<exif::Field>> = None;
    let mut pos = 8;
    while pos + 8 <= input.len() {
        let len = u32::from_be_bytes([
            input[pos],
            input[pos + 1],
            input[pos + 2],
            input[pos + 3],
        ]) as usize;
        let chunk_type = &input[pos + 4..pos + 8];
        let total = 12 + len;
        if pos + total > input.len() {
            return Err(StudioError::Param("truncated PNG".into()));
        }
        if chunk_type == b"eXIf" {
            let data = &input[pos + 8..pos + 8 + len];
            existing = exif::Reader::new()
                .read_raw(data.to_vec())
                .ok()
                .map(|e| e.fields().cloned().collect());
        }
        pos += total;
        if chunk_type == b"IEND" {
            break;
        }
    }

    let had_exif = existing.is_some();
    let fields = apply_edits(existing.unwrap_or_default(), edits, strip_gps)?;
    let new_chunk = if fields.is_empty() {
        None
    } else {
        Some(exif_chunk(&build_tiff(&fields)?))
    };
    if !had_exif && new_chunk.is_none() {
        return Ok(input.to_vec()); // nothing to change
    }

    // Second pass: rebuild — drop eXIf, insert the new chunk right after IHDR.
    let mut out = PNG_SIG.to_vec();
    let mut pos = 8;
    while pos + 8 <= input.len() {
        let len = u32::from_be_bytes([
            input[pos],
            input[pos + 1],
            input[pos + 2],
            input[pos + 3],
        ]) as usize;
        let chunk_type = &input[pos + 4..pos + 8];
        let total = 12 + len;
        if chunk_type == b"eXIf" {
            // replaced below (after IHDR)
        } else {
            out.extend_from_slice(&input[pos..pos + total]);
            if chunk_type == b"IHDR" {
                if let Some(chunk) = &new_chunk {
                    out.extend_from_slice(chunk);
                }
            }
        }
        pos += total;
        if chunk_type == b"IEND" {
            break;
        }
    }
    if pos < input.len() {
        out.extend_from_slice(&input[pos..]);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, GenericImageView, RgbaImage};

    fn tiff_with(fields: &[exif::Field]) -> Vec<u8> {
        let mut writer = exif::experimental::Writer::new();
        for f in fields {
            writer.push_field(f);
        }
        let mut tiff = Vec::new();
        writer.write(&mut Cursor::new(&mut tiff), true).unwrap();
        tiff
    }

    fn plain_jpeg() -> Vec<u8> {
        let mut buf = Vec::new();
        DynamicImage::ImageRgba8(RgbaImage::new(32, 32))
            .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Jpeg)
            .unwrap();
        buf
    }

    fn jpeg_with_exif(fields: &[exif::Field]) -> Vec<u8> {
        let mut block = EXIF_HEADER.to_vec();
        block.extend_from_slice(&tiff_with(fields));
        jpeg_replace_exif(&plain_jpeg(), &block).unwrap()
    }

    fn artist_field() -> exif::Field {
        exif::Field {
            tag: exif::Tag::Artist,
            ifd_num: exif::In::PRIMARY,
            value: exif::Value::Ascii(vec![b"BrushLLM Test".to_vec()]),
        }
    }

    #[test]
    fn strip_removes_exif_and_keeps_pixels() {
        let jpeg = jpeg_with_exif(&[artist_field()]);
        assert!(metadata::extract_exif_jpeg(&jpeg).is_some());
        let stripped = jpeg_strip_metadata(&jpeg).unwrap();
        assert!(metadata::extract_exif_jpeg(&stripped).is_none());
        let img = image::load_from_memory(&stripped).unwrap();
        assert_eq!(img.dimensions(), (32, 32));
    }

    #[test]
    fn edit_changes_artist_value() {
        let jpeg = jpeg_with_exif(&[artist_field()]);
        let edited = jpeg_edit_exif(
            &jpeg,
            &ExifEdits {
                artist: Some("New Artist".into()),
                ..Default::default()
            },
            false,
        )
        .unwrap();
        let fields = read_fields(&edited).unwrap();
        let artist = fields.iter().find(|f| f.tag == "Artist").expect("artist");
        assert!(artist.value.contains("New Artist"), "got {}", artist.value);
    }

    #[test]
    fn edit_all_text_fields() {
        let jpeg = jpeg_with_exif(&[artist_field()]);
        let edited = jpeg_edit_exif(
            &jpeg,
            &ExifEdits {
                date_time: Some("2026-09-21 10:00:00".into()),
                make: Some("BrushCam".into()),
                model: Some("BC-1".into()),
                description: Some("A test shot".into()),
                copyright: Some("© 2026".into()),
                ..Default::default()
            },
            false,
        )
        .unwrap();
        let fields = read_fields(&edited).unwrap();
        let get = |tag: &str| {
            fields
                .iter()
                .find(|f| f.tag == tag)
                .unwrap_or_else(|| panic!("{tag} missing"))
                .value
                .clone()
        };
        assert!(get("Make").contains("BrushCam"));
        assert!(get("Model").contains("BC-1"));
        assert!(get("ImageDescription").contains("A test shot"));
        assert!(get("Copyright").contains("2026"));
        // DateTime tags display as "YYYY-MM-DD HH:MM:SS" (colons become dashes).
        assert!(get("DateTimeOriginal").contains("2026-09-21"));
    }

    #[test]
    fn write_and_read_back_gps() {
        let jpeg = jpeg_with_exif(&[artist_field()]);
        let edited = jpeg_edit_exif(
            &jpeg,
            &ExifEdits {
                gps_lat: Some("31.2304".into()),
                gps_lon: Some("-118.4912".into()),
                ..Default::default()
            },
            false,
        )
        .unwrap();
        let fields = read_fields(&edited).unwrap();
        let lat = fields
            .iter()
            .find(|f| f.tag == "GPSLatitude")
            .and_then(|f| f.edit_value.clone())
            .expect("gps latitude");
        let lon = fields
            .iter()
            .find(|f| f.tag == "GPSLongitude")
            .and_then(|f| f.edit_value.clone())
            .expect("gps longitude");
        assert!((lat.parse::<f64>().unwrap() - 31.2304).abs() < 0.001, "{lat}");
        assert!((lon.parse::<f64>().unwrap() - -118.4912).abs() < 0.001, "{lon}");
    }

    #[test]
    fn strip_gps_removes_only_gps() {
        let jpeg = jpeg_with_exif(&[artist_field()]);
        let cleaned = jpeg_edit_exif(&jpeg, &ExifEdits::default(), true).unwrap();
        let fields = read_fields(&cleaned).unwrap();
        assert!(fields.iter().any(|f| f.tag == "Artist"));
        assert!(!fields.iter().any(|f| f.is_gps));
    }

    #[test]
    fn png_strip_keeps_image() {
        let mut png = Vec::new();
        DynamicImage::ImageRgba8(RgbaImage::new(20, 20))
            .write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        let stripped = png_strip_metadata(&png).unwrap();
        let img = image::load_from_memory(&stripped).unwrap();
        assert_eq!(img.dimensions(), (20, 20));
        assert!(stripped.len() <= png.len());
    }

    #[test]
    fn png_edit_and_strip_gps() {
        // Build a PNG with an eXIf chunk carrying Artist + GPS.
        let mut png = Vec::new();
        DynamicImage::ImageRgba8(RgbaImage::new(16, 16))
            .write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        let with_gps = png_edit_exif(
            &png,
            &ExifEdits {
                artist: Some("PNG Tester".into()),
                gps_lat: Some("35.68".into()),
                ..Default::default()
            },
            false,
        )
        .unwrap();
        let fields = read_fields(&with_gps).unwrap();
        assert!(fields.iter().any(|f| f.tag == "Artist"));
        assert!(fields.iter().any(|f| f.tag == "GPSLatitude"));

        // Strip GPS only — Artist must survive, PNG must still decode.
        let cleaned = png_edit_exif(&with_gps, &ExifEdits::default(), true).unwrap();
        let fields = read_fields(&cleaned).unwrap();
        assert!(fields.iter().any(|f| f.tag == "Artist"));
        assert!(!fields.iter().any(|f| f.is_gps));
        let img = image::load_from_memory(&cleaned).unwrap();
        assert_eq!(img.dimensions(), (16, 16));
    }

    #[test]
    fn date_normalization() {
        assert_eq!(
            normalize_date("2024-05-06 07:08:09").unwrap(),
            "2024:05:06 07:08:09"
        );
        assert_eq!(
            normalize_date("2024:05:06 07:08:09").unwrap(),
            "2024:05:06 07:08:09"
        );
        assert!(normalize_date("not a date").is_err());
    }
}
