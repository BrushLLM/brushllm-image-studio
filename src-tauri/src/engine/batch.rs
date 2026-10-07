use serde::{Deserialize, Serialize};

use super::{decode, encode, guard, metadata, ops, output};

/// True when the output format matches the file's own extension, so
/// re-encoding is a same-format "compress" rather than a conversion.
pub fn is_same_format(input_path: &str, format: encode::OutFormat) -> bool {
    let in_ext = std::path::Path::new(input_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    let out_ext = format.extension();
    in_ext == out_ext
        || (out_ext == "jpg" && (in_ext == "jpeg" || in_ext == "jpg"))
        || (out_ext == "tiff" && (in_ext == "tif" || in_ext == "tiff"))
}

/// A same-format re-encode that did not get smaller keeps the original
/// bytes — "compress" must never grow the file. `original` is the source
/// file's raw bytes; `encoded` is the fresh re-encode.
///
/// `allow` gates the fallback: keeping the original bytes is only correct
/// for a pure compress. Any edit step (resize, crop, …) must deliver its
/// own encoding even when it grows, and an EXIF drop is a real change the
/// re-encode must not silently undo. The original's actual on-disk format
/// must also match `format`, so a mislabeled extension can never swap the
/// delivered format.
pub fn never_grow(
    input_path: &str,
    format: encode::OutFormat,
    original: &[u8],
    encoded: Vec<u8>,
    allow: bool,
) -> Vec<u8> {
    if allow
        && is_same_format(input_path, format)
        && decode::same_output_format(original) == format
        && encoded.len() as u64 >= original.len() as u64
    {
        original.to_vec()
    } else {
        encoded
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Collision {
    Overwrite,
    Skip,
    Rename,
}

/// Where results go. `dir = None` writes next to each input file.
#[derive(Debug, Clone, Deserialize)]
pub struct OutputSettings {
    pub dir: Option<String>,
    pub suffix: String,
    pub collision: Collision,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BatchJob {
    pub files: Vec<String>,
    pub steps: Vec<ops::Step>,
    /// `None` keeps the input format when encodable (GIF/BMP/TIFF fall back to PNG).
    pub format: Option<encode::OutFormat>,
    pub quality: u8,
    /// Re-insert the original EXIF block (JPEG output only).
    pub preserve_exif: bool,
    pub output: OutputSettings,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileOutcome {
    pub input: String,
    pub file: String,
    /// "ok" | "skipped" | "failed"
    pub status: String,
    pub output_path: Option<String>,
    pub error: Option<String>,
    pub in_bytes: u64,
    pub out_bytes: u64,
    pub ms: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct BatchReport {
    pub total: usize,
    pub ok: usize,
    pub failed: usize,
    pub skipped: usize,
    pub in_bytes: u64,
    pub out_bytes: u64,
    pub ms: u64,
    pub cancelled: bool,
    pub items: Vec<FileOutcome>,
}

pub fn run<F: FnMut(usize, usize, &FileOutcome)>(
    job: BatchJob,
    cancel: Option<&std::sync::atomic::AtomicBool>,
    mut on_file: F,
) -> BatchReport {
    use std::sync::atomic::Ordering;

    let started = std::time::Instant::now();
    let total = job.files.len();
    let mut items = Vec::with_capacity(total);
    let (mut ok, mut failed, mut skipped) = (0usize, 0usize, 0usize);
    let (mut in_total, mut out_total) = (0u64, 0u64);
    let mut cancelled = false;

    // One-shot validation: a bad suffix or output folder fails every file
    // before any input is read, so a half-applied batch cannot happen.
    if let Some(error) = validate_job(&job) {
        for (index, file) in job.files.iter().enumerate() {
            let outcome = validation_failure(file, error.clone());
            failed += 1;
            on_file(index, total, &outcome);
            items.push(outcome);
        }
        return BatchReport {
            total,
            ok,
            failed,
            skipped,
            in_bytes: in_total,
            out_bytes: out_total,
            ms: started.elapsed().as_millis() as u64,
            cancelled,
            items,
        };
    }

    // Inputs not yet consumed: item i's output must never clobber the input
    // of a later item. The current input itself stays unprotected — writing
    // over it in place is the user's explicit Overwrite choice.
    let inputs: Vec<std::path::PathBuf> = job.files.iter().map(std::path::PathBuf::from).collect();

    for (index, file) in job.files.iter().enumerate() {
        if cancel.is_some_and(|flag| flag.load(Ordering::Relaxed)) {
            cancelled = true;
            break;
        }
        let protected = &inputs[index + 1..];
        let outcome = process_one(file, &job, protected);
        match outcome.status.as_str() {
            "ok" => {
                ok += 1;
                in_total += outcome.in_bytes;
                out_total += outcome.out_bytes;
            }
            "skipped" => skipped += 1,
            _ => failed += 1,
        }
        on_file(index, total, &outcome);
        items.push(outcome);
    }

    BatchReport {
        total,
        ok,
        failed,
        skipped,
        in_bytes: in_total,
        out_bytes: out_total,
        ms: started.elapsed().as_millis() as u64,
        cancelled,
        items,
    }
}

/// Validate the whole job up front. Returns the shared error text when the
/// batch must not start at all.
fn validate_job(job: &BatchJob) -> Option<String> {
    if let Err(e) = guard::validate_suffix(&job.output.suffix) {
        return Some(e.to_string());
    }
    if let Some(dir) = &job.output.dir {
        if let Err(e) = guard::validate_output_dir(std::path::Path::new(dir)) {
            return Some(e.to_string());
        }
    }
    None
}

/// The per-file outcome for a job-level validation failure: nothing was
/// read or written, every file failed for the same reason.
fn validation_failure(file: &str, error: String) -> FileOutcome {
    let path = std::path::Path::new(file);
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| file.to_string());
    FileOutcome {
        input: file.to_string(),
        file: file_name,
        status: "failed".into(),
        output_path: None,
        error: Some(error),
        in_bytes: 0,
        out_bytes: 0,
        ms: 0,
    }
}

fn process_one(file: &str, job: &BatchJob, protected: &[std::path::PathBuf]) -> FileOutcome {
    let started = std::time::Instant::now();
    let path = std::path::Path::new(file);
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| file.to_string());

    let fail = |error: String, in_bytes: u64| FileOutcome {
        input: file.to_string(),
        file: file_name.clone(),
        status: "failed".into(),
        output_path: None,
        error: Some(error),
        in_bytes,
        out_bytes: 0,
        ms: started.elapsed().as_millis() as u64,
    };

    // Reject FIFOs/devices and oversized files before anything is read.
    if let Err(e) = guard::validate_input_file(path) {
        return fail(e.to_string(), 0);
    }

    let bytes = match decode::read_bytes(path) {
        Ok(b) => b,
        Err(e) => return fail(e.to_string(), 0),
    };
    let in_bytes = bytes.len() as u64;

    // The bytes are already in memory — decode from the buffer instead of
    // hitting the disk a second time.
    let img = match decode::decode_from_buffer(&bytes) {
        Ok(img) => img,
        Err(e) => return fail(e.to_string(), in_bytes),
    };

    let processed = match ops::apply_steps(img, &job.steps) {
        Ok(img) => img,
        Err(e) => return fail(e.to_string(), in_bytes),
    };

    let format = job
        .format
        .unwrap_or_else(|| decode::same_output_format(&bytes));
    let encoded = match encode::encode(
        &processed,
        &encode::EncodeSettings {
            format,
            quality: job.quality,
        },
    ) {
        Ok(b) => b,
        Err(e) => return fail(e.to_string(), in_bytes),
    };

    let mut encoded = encoded;
    if job.preserve_exif && format == encode::OutFormat::Jpeg {
        if let Some(exif_block) = metadata::extract_exif_jpeg(&bytes) {
            metadata::insert_exif_jpeg(&mut encoded, &exif_block);
        }
    }

    // A compression must never grow a same-format file — but only a pure
    // compress may fall back to the original bytes. Any edit step must ship
    // its own encoding, and when EXIF is being dropped (preserve_exif =
    // false on a JPEG that carries EXIF) the re-encode is the honest
    // result: falling back would silently keep the metadata.
    let allow_fallback = job.steps.is_empty()
        && !(!job.preserve_exif && metadata::extract_exif_jpeg(&bytes).is_some());
    let encoded = never_grow(file, format, &bytes, encoded, allow_fallback);

    // Output path: target dir (or the input's folder) + stem + suffix + extension.
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let out_dir = job
        .output
        .dir
        .as_ref()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            path.parent()
                .map(std::path::Path::to_path_buf)
                .unwrap_or_default()
        });
    let out_name = format!("{}{}.{}", stem, job.output.suffix, format.extension());
    let out_path = out_dir.join(&out_name);

    // The parent folder must exist (or be creatable); a failure here is
    // reported, not swallowed.
    if let Some(parent) = out_path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return fail(
                format!("cannot create folder {}: {e}", parent.display()),
                in_bytes,
            );
        }
    }

    // Crash-safe write honoring the collision policy. `protected` keeps
    // not-yet-consumed inputs safe even under Overwrite.
    match output::write_output(&out_path, &encoded, job.output.collision, protected) {
        Ok(output::WriteOutcome::Written(final_path)) => FileOutcome {
            input: file.to_string(),
            file: file_name,
            status: "ok".into(),
            output_path: Some(final_path.to_string_lossy().to_string()),
            error: None,
            in_bytes,
            out_bytes: encoded.len() as u64,
            ms: started.elapsed().as_millis() as u64,
        },
        Ok(output::WriteOutcome::Skipped(final_path)) => FileOutcome {
            input: file.to_string(),
            file: file_name,
            status: "skipped".into(),
            output_path: Some(final_path.to_string_lossy().to_string()),
            error: Some("file already exists".into()),
            in_bytes,
            out_bytes: 0,
            ms: started.elapsed().as_millis() as u64,
        },
        Err(e) => fail(e.to_string(), in_bytes),
    }
}

// Legacy path picker: superseded by engine::output::write_output (crash-safe
// commits with the same collision semantics). Kept only behind tests as a
// naming reference for "name (N)" slot selection.
#[cfg(test)]
#[derive(Debug)]
pub(crate) enum CollisionDecision {
    Skip,
    Write(std::path::PathBuf),
}

#[cfg(test)]
pub(crate) fn resolve_collision(path: &std::path::Path, policy: Collision) -> CollisionDecision {
    if !path.exists() {
        return CollisionDecision::Write(path.to_path_buf());
    }
    match policy {
        Collision::Skip => CollisionDecision::Skip,
        Collision::Overwrite => CollisionDecision::Write(path.to_path_buf()),
        Collision::Rename => {
            let stem = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let ext = path
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();
            let parent = path.parent().unwrap_or(std::path::Path::new(""));
            for n in 2..10_000 {
                let candidate = parent.join(format!("{stem} ({n}){ext}"));
                if !candidate.exists() {
                    return CollisionDecision::Write(candidate);
                }
            }
            CollisionDecision::Skip
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// "Compress" must never grow a same-format file: a re-encode that
    /// cannot beat the original keeps the original bytes untouched.
    #[test]
    fn never_grow_keeps_original_when_reencode_is_larger() {
        let original = vec![0u8; 1000];
        let larger = vec![0u8; 1200];
        let out = never_grow(
            "photo.png",
            encode::OutFormat::Png,
            &original,
            larger.clone(),
            true,
        );
        assert_eq!(out.len(), original.len(), "larger re-encode must fall back");
        // A smaller re-encode is kept.
        let smaller = vec![0u8; 800];
        let out = never_grow(
            "photo.png",
            encode::OutFormat::Png,
            &original,
            smaller,
            true,
        );
        assert_eq!(out.len(), 800);
    }

    /// Cross-format conversions are exempt — growing is expected there.
    #[test]
    fn never_grow_does_not_apply_across_formats() {
        let original = vec![0u8; 1000];
        let larger = vec![0u8; 5000];
        let out = never_grow("photo.png", encode::OutFormat::Bmp, &original, larger, true);
        assert_eq!(out.len(), 5000, "conversions may legitimately grow");
    }

    /// The fallback is gated: edit steps and metadata changes must ship
    /// their own encoding even when it grows.
    #[test]
    fn never_grow_disabled_when_not_allowed() {
        let original = vec![0u8; 1000];
        let larger = vec![0u8; 1200];
        let out = never_grow(
            "photo.png",
            encode::OutFormat::Png,
            &original,
            larger,
            false,
        );
        assert_eq!(out.len(), 1200, "no fallback unless the job allows it");
    }

    /// Extension/content mismatch: a ".png" name holding JPEG bytes must
    /// not fall back — that would silently deliver the wrong format.
    #[test]
    fn never_grow_requires_matching_content_format() {
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::new(4, 4));
        let mut buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut buf, image::ImageFormat::Jpeg).unwrap();
        let jpeg = buf.into_inner();
        let larger = vec![0u8; jpeg.len() + 1000];
        let out = never_grow("photo.png", encode::OutFormat::Png, &jpeg, larger, true);
        assert_eq!(
            out.len(),
            jpeg.len() + 1000,
            "content format must match the target format to fall back"
        );
    }

    #[test]
    fn same_format_matches_jpg_and_tiff_aliases() {
        assert!(is_same_format("a.jpeg", encode::OutFormat::Jpeg));
        assert!(is_same_format("a.jpg", encode::OutFormat::Jpeg));
        assert!(is_same_format("a.tif", encode::OutFormat::Tiff));
        assert!(is_same_format("a.tiff", encode::OutFormat::Tiff));
        assert!(!is_same_format("a.png", encode::OutFormat::Jpeg));
    }

    #[test]
    fn collision_rename_finds_free_slot() {
        let dir = std::env::temp_dir().join(format!("bs-collision-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let base = dir.join("photo.png");
        std::fs::write(&base, b"x").unwrap();
        match resolve_collision(&base, Collision::Rename) {
            CollisionDecision::Write(p) => {
                assert_eq!(p.file_name().unwrap().to_str().unwrap(), "photo (2).png")
            }
            other => panic!("unexpected: {other:?}"),
        }
        // Occupy (2) too — next free is (3).
        std::fs::write(dir.join("photo (2).png"), b"x").unwrap();
        match resolve_collision(&base, Collision::Rename) {
            CollisionDecision::Write(p) => {
                assert_eq!(p.file_name().unwrap().to_str().unwrap(), "photo (3).png")
            }
            other => panic!("unexpected: {other:?}"),
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn collision_skip_and_overwrite() {
        let dir = std::env::temp_dir().join(format!("bs-skip-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("a.png");
        std::fs::write(&target, b"x").unwrap();
        assert!(matches!(
            resolve_collision(&target, Collision::Skip),
            CollisionDecision::Skip
        ));
        assert!(matches!(
            resolve_collision(&target, Collision::Overwrite),
            CollisionDecision::Write(_)
        ));
        // Nonexistent target writes directly regardless of policy.
        let fresh = dir.join("fresh.png");
        assert!(matches!(
            resolve_collision(&fresh, Collision::Skip),
            CollisionDecision::Write(_)
        ));
        std::fs::remove_dir_all(&dir).ok();
    }

    fn job(steps: Vec<ops::Step>, format: Option<encode::OutFormat>) -> BatchJob {
        BatchJob {
            files: vec![],
            steps,
            format,
            quality: 80,
            preserve_exif: false,
            output: OutputSettings {
                dir: None,
                suffix: String::new(),
                collision: Collision::Rename,
            },
        }
    }

    #[test]
    fn convert_png_to_jpeg_writes_output() {
        let dir = std::env::temp_dir().join("studio-test-convert");
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.png");
        DynamicZero::write_png(&input);

        let mut j = job(vec![], Some(encode::OutFormat::Jpeg));
        j.files = vec![input.to_string_lossy().to_string()];
        j.output.dir = Some(dir.join("out").to_string_lossy().to_string());
        std::fs::create_dir_all(dir.join("out")).unwrap();

        let report = run(j, None, |_, _, _| {});
        assert_eq!(report.ok, 1);
        assert_eq!(report.failed, 0);
        let out = report.items[0].output_path.clone().unwrap();
        assert!(out.ends_with(".jpg"));
        assert!(std::path::Path::new(&out).exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rename_policy_avoids_overwrite() {
        let dir = std::env::temp_dir().join("studio-test-collision");
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.png");
        DynamicZero::write_png(&input);

        let mut j = job(
            vec![ops::Step::Resize {
                width: Some(8),
                height: None,
                percent: None,
                mode: ops::FitMode::Fit,
                no_enlarge: false,
            }],
            None,
        );
        j.files = vec![input.to_string_lossy().to_string()];
        j.output.suffix = "-small".into();

        let first = run(j.clone(), None, |_, _, _| {});
        let second = run(j, None, |_, _, _| {});
        assert_eq!(first.ok + second.ok, 2);
        // "in-small.png" existed by the second run, so it wrote "in-small (2).png".
        let second_out = second.items[0].output_path.clone().unwrap();
        assert!(second_out.contains("in-small (2).png"), "got {second_out}");
        std::fs::remove_dir_all(&dir).ok();
    }

    /// An edit step must ship its own encoding: when a resize makes the
    /// output larger than the input, the file on disk is the fresh
    /// encoding, never the original bytes.
    #[test]
    fn resize_step_growing_output_does_not_fall_back() {
        let dir = std::env::temp_dir().join("studio-test-grow");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.png");
        // 8x8 noise: a tiny file whose 256px upscale re-encode is larger.
        let mut rng: u64 = 0x9E3779B97F4A7C15;
        let noise: Vec<u8> = (0..8 * 8 * 4)
            .map(|_| {
                rng ^= rng << 13;
                rng ^= rng >> 7;
                rng ^= rng << 17;
                (rng >> 33) as u8
            })
            .collect();
        image::RgbaImage::from_raw(8, 8, noise)
            .unwrap()
            .save_with_format(&input, image::ImageFormat::Png)
            .unwrap();

        let mut j = job(
            vec![ops::Step::Resize {
                width: Some(256),
                height: None,
                percent: None,
                mode: ops::FitMode::Fit,
                no_enlarge: false,
            }],
            None,
        );
        j.files = vec![input.to_string_lossy().to_string()];
        j.output.suffix = "-big".into();
        j.output.collision = Collision::Overwrite;

        let report = run(j, None, |_, _, _| {});
        assert_eq!(report.failed, 0, "{:?}", report.items[0].error);
        let item = &report.items[0];
        assert_eq!(item.status, "ok");
        assert!(
            item.out_bytes > item.in_bytes,
            "upscale must grow: in={} out={}",
            item.in_bytes,
            item.out_bytes
        );
        let out = std::path::Path::new(item.output_path.as_ref().unwrap());
        assert_ne!(
            std::fs::read(out).unwrap(),
            std::fs::read(&input).unwrap(),
            "output must be the fresh encoding, not the original bytes"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A suffix with separators or traversal never starts the batch: every
    /// file fails up front with the suffix error and nothing is written.
    #[test]
    fn invalid_suffix_fails_every_file_upfront() {
        let dir = std::env::temp_dir().join("studio-test-bad-suffix");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.png");
        DynamicZero::write_png(&input);

        for bad in ["a/b", ".."] {
            let mut j = job(vec![], None);
            j.files = vec![input.to_string_lossy().to_string()];
            j.output.suffix = bad.into();
            let report = run(j, None, |_, _, _| {});
            assert_eq!(report.ok, 0, "bad suffix {bad:?}");
            assert_eq!(report.failed, 1, "bad suffix {bad:?}");
            let item = &report.items[0];
            assert_eq!(item.status, "failed");
            let error = item.error.as_deref().unwrap();
            assert!(error.contains("suffix"), "bad={bad:?} error={error}");
            // Nothing was written next to the input.
            assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// An output that would overwrite a LATER input is rejected even under
    /// the Overwrite policy: in.png + suffix "-x" targets in-x.png, which
    /// is the second item's not-yet-consumed input. That write is refused,
    /// the first item fails, and in-x.png keeps its original bytes; the
    /// second item then runs normally on its intact input.
    #[test]
    fn output_overwriting_later_input_is_rejected() {
        let dir = std::env::temp_dir().join("studio-test-protect");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let first = dir.join("in.png");
        let second = dir.join("in-x.png");
        DynamicZero::write_png(&first);
        DynamicZero::write_png(&second);
        let second_before = std::fs::read(&second).unwrap();

        let mut j = job(vec![], None);
        j.files = vec![
            first.to_string_lossy().to_string(),
            second.to_string_lossy().to_string(),
        ];
        j.output.suffix = "-x".into();
        j.output.collision = Collision::Overwrite;

        let report = run(j, None, |_, _, _| {});
        // First item: its output "in-x.png" is the second item's input.
        let item = &report.items[0];
        assert_eq!(item.status, "failed");
        let error = item.error.as_deref().unwrap();
        assert!(error.contains("overwrite"), "error={error}");
        // The later input survived byte-for-byte.
        assert_eq!(std::fs::read(&second).unwrap(), second_before);
        // The second item itself completed on the intact input.
        assert_eq!(report.items[1].status, "ok");
        assert!(report.items[1]
            .output_path
            .as_deref()
            .unwrap()
            .contains("in-x-x.png"));
        assert_eq!(report.failed, 1);
        assert_eq!(report.ok, 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    // Tiny helper that writes a real PNG so tests exercise the full pipeline.
    struct DynamicZero;
    impl DynamicZero {
        fn write_png(path: &std::path::Path) {
            let img = image::DynamicImage::ImageRgba8(image::RgbaImage::new(40, 30));
            img.save(path).unwrap();
        }
    }
}
