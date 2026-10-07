use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::api;
use crate::api_key;
use crate::engine::batch::{self, BatchJob, BatchReport, OutputSettings};
use crate::engine::encode::{self, EncodeSettings, OutFormat};
use crate::engine::stitch;
use crate::engine::{compose, decode, guard, output as engine_output};
use crate::settings::Settings;

/// Mutable app state managed by Tauri.
pub struct AppState {
    pub settings: std::sync::Mutex<Settings>,
    /// One active batch at a time; the token belongs to that job only, so
    /// cancelling never leaks into a later run.
    pub active_batch: std::sync::Mutex<Option<std::sync::Arc<std::sync::atomic::AtomicBool>>>,
}

#[derive(Serialize, Clone)]
struct BatchProgress {
    index: usize,
    total: usize,
    file: String,
    status: String,
    error: Option<String>,
}

#[tauri::command]
pub async fn run_batch(
    app: AppHandle,
    state: State<'_, AppState>,
    job: BatchJob,
) -> Result<BatchReport, String> {
    if job.files.len() > guard::limits::MAX_BATCH_FILES {
        return Err(format!(
            "too many files ({}); the limit is {}",
            job.files.len(),
            guard::limits::MAX_BATCH_FILES
        ));
    }
    let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    {
        let mut slot = state.active_batch.lock().unwrap();
        if slot.is_some() {
            return Err("a batch is already running — wait for it or cancel it first".into());
        }
        *slot = Some(cancel.clone());
    }
    let app_for_cleanup = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let emitter = app.clone();
        batch::run(job, Some(&cancel), move |index, total, outcome| {
            let _ = emitter.emit(
                "batch-progress",
                BatchProgress {
                    index,
                    total,
                    // Full input path: queue thumbnails match on this, so
                    // same-named files in different folders never cross-wire.
                    file: outcome.input.clone(),
                    status: outcome.status.clone(),
                    error: outcome.error.clone(),
                },
            );
        })
    })
    .await
    .map_err(|e| format!("batch task failed: {e}"));
    // Release the job slot so the next batch can start.
    use tauri::Manager;
    if let Some(state) = app_for_cleanup.try_state::<AppState>() {
        *state.active_batch.lock().unwrap() = None;
    }
    result
}

#[derive(Debug, Clone, Deserialize)]
pub struct StitchJob {
    pub files: Vec<String>,
    pub opts: stitch::StitchOpts,
    pub format: OutFormat,
    pub quality: u8,
    pub output: OutputSettings,
}

/// Stitch many images into one long image; returns the output path.
#[tauri::command]
pub async fn run_stitch(job: StitchJob) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if job.files.is_empty() {
            return Err("no images to stitch".into());
        }
        let mut images = Vec::with_capacity(job.files.len());
        for file in &job.files {
            let path = std::path::Path::new(file);
            guard::validate_input_file(path).map_err(|e| e.to_string())?;
            images.push(decode::decode_file(path).map_err(|e| e.to_string())?);
        }
        let stitched = stitch::stitch(images, &job.opts).map_err(|e| e.to_string())?;
        let encoded = encode::encode(
            &stitched,
            &EncodeSettings {
                format: job.format,
                quality: job.quality,
            },
        )
        .map_err(|e| e.to_string())?;
        let (out_path, collision) = single_output_path(&job.files[0], &job.format, &job.output)?;
        // Stitch inputs are all consumed by decode before writing, so no
        // protected set is needed here.
        match engine_output::write_output(&out_path, &encoded, collision, &[]) {
            Ok(engine_output::WriteOutcome::Written(p)) => Ok(p.to_string_lossy().to_string()),
            Ok(engine_output::WriteOutcome::Skipped(p)) => {
                Err(format!("skipped: {} already exists", p.display()))
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| format!("stitch task failed: {e}"))?
}

#[derive(Debug, Clone, Deserialize)]
pub struct OverlayJob {
    pub image_path: String,
    /// Watermark layer as a full-size transparent PNG.
    pub overlay_b64: String,
    /// None = keep the input format where encodable.
    pub format: Option<OutFormat>,
    pub quality: u8,
    pub preserve_exif: bool,
    pub output: OutputSettings,
}

/// Composite a watermark overlay onto an image; returns the output path.
#[tauri::command]
pub async fn apply_overlay(job: OverlayJob) -> Result<String, String> {
    use base64::Engine;
    tauri::async_runtime::spawn_blocking(move || {
        use image::GenericImageView;
        guard::validate_input_file(std::path::Path::new(&job.image_path))
            .map_err(|e| e.to_string())?;
        let bytes =
            decode::read_bytes(std::path::Path::new(&job.image_path)).map_err(|e| e.to_string())?;
        let base = decode::decode_from_buffer(&bytes).map_err(|e| e.to_string())?;
        let overlay_raw = base64::engine::general_purpose::STANDARD
            .decode(&job.overlay_b64)
            .map_err(|e| format!("invalid overlay data: {e}"))?;
        let overlay = image::load_from_memory(&overlay_raw)
            .map_err(|e| format!("invalid overlay PNG: {e}"))?
            .to_rgba8();
        if overlay.dimensions() != base.dimensions() {
            return Err(format!(
                "overlay is {}x{} but the image is {}x{} — regenerate the preview",
                overlay.width(),
                overlay.height(),
                base.width(),
                base.height()
            ));
        }
        let composed = compose::compose(base, overlay).map_err(|e| e.to_string())?;
        let format = job
            .format
            .unwrap_or_else(|| decode::same_output_format(&bytes));
        let mut encoded = encode::encode(
            &composed,
            &EncodeSettings {
                format,
                quality: job.quality,
            },
        )
        .map_err(|e| e.to_string())?;
        if job.preserve_exif && format == OutFormat::Jpeg {
            if let Some(exif_block) = crate::engine::metadata::extract_exif_jpeg(&bytes) {
                crate::engine::metadata::insert_exif_jpeg(&mut encoded, &exif_block);
            }
        }
        let out_path = single_output_path(&job.image_path, &format, &job.output)?;
        match engine_output::write_output(
            &out_path.0,
            &encoded,
            out_path.1,
            &[std::path::PathBuf::from(&job.image_path)],
        ) {
            Ok(engine_output::WriteOutcome::Written(p)) => Ok(p.to_string_lossy().to_string()),
            Ok(engine_output::WriteOutcome::Skipped(p)) => {
                Err(format!("skipped: {} already exists", p.display()))
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| format!("overlay task failed: {e}"))?
}

/// Resolve the output path for single-result tools (stitch/watermark).
/// Returns (path, collision-policy) — the caller commits via write_output.
fn single_output_path(
    first_input: &str,
    format: &OutFormat,
    output: &OutputSettings,
) -> Result<(std::path::PathBuf, batch::Collision), String> {
    let input = std::path::Path::new(first_input);
    let stem = input
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    // Suffix and directory go through the central guard — no separators,
    // no traversal, no control characters, dir must be a real folder.
    let suffix = guard::validate_suffix(&output.suffix).map_err(|e| e.to_string())?;
    let out_dir = match &output.dir {
        Some(dir) => {
            guard::validate_output_dir(std::path::Path::new(dir)).map_err(|e| e.to_string())?
        }
        None => input
            .parent()
            .map(std::path::Path::to_path_buf)
            .unwrap_or_default(),
    };
    let file_name = format!("{}{}.{}", stem, suffix, format.extension());
    let path = out_dir.join(&file_name);
    let path = guard::validate_output_path(&path).map_err(|e| e.to_string())?;
    Ok((path, output.collision))
}

/// Serve a local image as a data: URL. Canvas drawing of asset-protocol images
/// taints the canvas in the webview; data URLs are same-origin and safe.
#[tauri::command]
pub fn read_asset(path: String) -> Result<String, String> {
    use base64::Engine;
    if !guard::has_no_parent_traversal(&path) {
        return Err(format!("unsafe image path: {path}"));
    }
    guard::validate_input_file(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    let bytes = std::fs::read(&path).map_err(|e| format!("cannot read {path}: {e}"))?;
    let mime = sniff_image_mime(&bytes, &path);
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

/// The user's OS Pictures folder — one-click default output directory.
#[tauri::command]
pub fn pictures_dir(app: AppHandle) -> Option<String> {
    use tauri::Manager;
    app.path()
        .picture_dir()
        .ok()
        .map(|p| p.to_string_lossy().to_string())
}

/// Lightweight file facts (name + size) for queue thumbnails.
#[tauri::command]
pub fn file_meta(path: String) -> Result<serde_json::Value, String> {
    guard::validate_input_file(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    let meta = std::fs::metadata(&path).map_err(|e| format!("cannot stat {path}: {e}"))?;
    let name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    Ok(serde_json::json!({ "name": name, "bytes": meta.len() }))
}

fn sniff_image_mime(bytes: &[u8], path: &str) -> String {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png".into()
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        "image/jpeg".into()
    } else if bytes.starts_with(b"RIFF") && bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
        "image/webp".into()
    } else if bytes.starts_with(b"GIF8") {
        "image/gif".into()
    } else if bytes.starts_with(b"BM") {
        "image/bmp".into()
    } else if bytes.starts_with(&[0x49, 0x49]) || bytes.starts_with(&[0x4D, 0x4D]) {
        "image/tiff".into()
    } else {
        match path
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str()
        {
            "jpg" | "jpeg" => "image/jpeg".into(),
            "webp" => "image/webp".into(),
            "gif" => "image/gif".into(),
            "bmp" => "image/bmp".into(),
            "tif" | "tiff" => "image/tiff".into(),
            _ => "image/png".into(),
        }
    }
}

// ---- EXIF view / strip / edit ----

#[tauri::command]
pub fn read_exif(path: String) -> Result<Vec<crate::engine::exif_edit::FieldInfo>, String> {
    if !guard::has_no_parent_traversal(&path) {
        return Err(format!("unsafe image path: {path}"));
    }
    guard::validate_input_file(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    let bytes = std::fs::read(&path).map_err(|e| format!("cannot read {path}: {e}"))?;
    match crate::engine::exif_edit::read_fields(&bytes) {
        Ok(fields) => Ok(fields),
        Err(e) => {
            // A readable image without EXIF is not an error — show an empty list.
            if image::load_from_memory(&bytes).is_ok() {
                Ok(Vec::new())
            } else {
                Err(e.to_string())
            }
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExifJob {
    pub image_path: String,
    pub action: ExifAction,
    pub output: OutputSettings,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ExifAction {
    StripAll,
    StripGps,
    Edit {
        date_time: Option<String>,
        make: Option<String>,
        model: Option<String>,
        gps_lat: Option<String>,
        gps_lon: Option<String>,
        description: Option<String>,
        artist: Option<String>,
        copyright: Option<String>,
    },
}

impl ExifAction {
    fn edits(&self) -> crate::engine::exif_edit::ExifEdits {
        match self {
            ExifAction::Edit {
                date_time,
                make,
                model,
                gps_lat,
                gps_lon,
                description,
                artist,
                copyright,
            } => crate::engine::exif_edit::ExifEdits {
                date_time: date_time.clone(),
                make: make.clone(),
                model: model.clone(),
                gps_lat: gps_lat.clone(),
                gps_lon: gps_lon.clone(),
                description: description.clone(),
                artist: artist.clone(),
                copyright: copyright.clone(),
            },
            _ => crate::engine::exif_edit::ExifEdits::default(),
        }
    }
}

#[tauri::command]
pub async fn apply_exif(job: ExifJob) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use crate::engine::exif_edit;
        if !guard::has_no_parent_traversal(&job.image_path) {
            return Err(format!("unsafe image path: {}", job.image_path));
        }
        guard::validate_input_file(std::path::Path::new(&job.image_path))
            .map_err(|e| e.to_string())?;
        let bytes = std::fs::read(&job.image_path).map_err(|e| format!("cannot read: {e}"))?;
        let format =
            image::guess_format(&bytes).map_err(|e| format!("unrecognized image format: {e}"))?;

        let strip_all = matches!(job.action, ExifAction::StripAll);
        let strip_gps = matches!(job.action, ExifAction::StripGps);
        let edits = job.action.edits();

        let (out_bytes, ext): (Vec<u8>, &'static str) = match format {
            image::ImageFormat::Jpeg => {
                let out = if strip_all {
                    // Drop the whole APP1/APP13/COM payload — no EXIF survives.
                    exif_edit::jpeg_strip_metadata(&bytes)
                } else {
                    exif_edit::jpeg_edit_exif(&bytes, &edits, strip_gps)
                }
                .map_err(|e| e.to_string())?;
                (out, "jpg")
            }
            image::ImageFormat::Png => {
                // StripAll also removes tEXt/zTXt/iTXt; edit/gps rewrite eXIf.
                let out = if matches!(job.action, ExifAction::StripAll) {
                    exif_edit::png_strip_metadata(&bytes).map_err(|e| e.to_string())?
                } else {
                    exif_edit::png_edit_exif(&bytes, &edits, strip_gps)
                        .map_err(|e| e.to_string())?
                };
                (out, "png")
            }
            image::ImageFormat::WebP if matches!(job.action, ExifAction::StripAll) => {
                // No lossless WebP segment rewriting; re-encode (metadata drops).
                let img = crate::engine::decode::decode_file(std::path::Path::new(&job.image_path))
                    .map_err(|e| e.to_string())?;
                let out = crate::engine::encode::encode(
                    &img,
                    &crate::engine::encode::EncodeSettings {
                        format: crate::engine::encode::OutFormat::Webp,
                        quality: 100,
                    },
                )
                .map_err(|e| e.to_string())?;
                (out, "webp")
            }
            other => {
                return Err(format!(
                    "metadata editing for {other:?} is not supported yet (JPEG and PNG work best)"
                ))
            }
        };

        // Reuse the output naming rules, but with the (possibly new) extension.
        let format = match ext {
            "jpg" => OutFormat::Jpeg,
            "png" => OutFormat::Png,
            "webp" => OutFormat::Webp,
            _ => OutFormat::Png,
        };
        let (out_path, collision) = single_output_path(&job.image_path, &format, &job.output)?;
        match engine_output::write_output(
            &out_path,
            &out_bytes,
            collision,
            &[std::path::PathBuf::from(&job.image_path)],
        ) {
            Ok(engine_output::WriteOutcome::Written(p)) => Ok(p.to_string_lossy().to_string()),
            Ok(engine_output::WriteOutcome::Skipped(p)) => {
                Err(format!("skipped: {} already exists", p.display()))
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| format!("exif task failed: {e}"))?
}

// ---- Real previews (run the actual engine pipeline, return a data URL) ----

#[derive(Serialize)]
pub struct PreviewResult {
    pub data_url: String,
    /// Size of the preview encoding ≈ the real output size for this file.
    pub bytes: u64,
    pub in_bytes: u64,
}

#[tauri::command]
pub async fn preview_batch(
    file: String,
    steps: Vec<crate::engine::ops::Step>,
    format: Option<OutFormat>,
    quality: u8,
) -> Result<PreviewResult, String> {
    use base64::Engine;
    tauri::async_runtime::spawn_blocking(move || {
        guard::validate_input_file(std::path::Path::new(&file)).map_err(|e| e.to_string())?;
        let bytes = decode::read_bytes(std::path::Path::new(&file)).map_err(|e| e.to_string())?;
        let img = decode::decode_from_buffer(&bytes).map_err(|e| e.to_string())?;
        let processed = crate::engine::ops::apply_steps(img, &steps).map_err(|e| e.to_string())?;
        let format = format.unwrap_or_else(|| decode::same_output_format(&bytes));
        let encoded = encode::encode(&processed, &EncodeSettings { format, quality })
            .map_err(|e| e.to_string())?;
        // Mirror the batch pipeline: a same-format "compress" that cannot
        // beat the original keeps the original bytes, so the previewed size
        // matches what actually gets written. Edited images (steps present)
        // never fall back — the preview must show the real edit.
        let encoded =
            crate::engine::batch::never_grow(&file, format, &bytes, encoded, steps.is_empty());
        let len = encoded.len() as u64;
        let mime = match format {
            OutFormat::Jpeg => "image/jpeg",
            OutFormat::Png => "image/png",
            OutFormat::Webp => "image/webp",
            OutFormat::Avif => "image/avif",
            OutFormat::Tiff => "image/tiff",
            OutFormat::Bmp => "image/bmp",
            OutFormat::Svg => "image/svg+xml",
            OutFormat::Ico => "image/x-icon",
        };
        Ok(PreviewResult {
            data_url: format!(
                "data:{mime};base64,{}",
                base64::engine::general_purpose::STANDARD.encode(encoded)
            ),
            bytes: len,
            in_bytes: bytes.len() as u64,
        })
    })
    .await
    .map_err(|e| format!("preview failed: {e}"))?
}

#[tauri::command]
pub async fn preview_stitch(
    files: Vec<String>,
    opts: stitch::StitchOpts,
) -> Result<PreviewResult, String> {
    use base64::Engine;
    const MAX_PREVIEW_IMAGES: usize = 10;
    tauri::async_runtime::spawn_blocking(move || {
        let files = &files[..files.len().min(MAX_PREVIEW_IMAGES)];
        let mut images = Vec::with_capacity(files.len());
        for file in files {
            let path = std::path::Path::new(file);
            guard::validate_input_file(path).map_err(|e| e.to_string())?;
            images.push(decode::decode_file(path).map_err(|e| e.to_string())?);
        }
        let stitched = stitch::stitch(images, &opts).map_err(|e| e.to_string())?;
        let encoded = encode::encode(
            &stitched,
            &EncodeSettings {
                format: OutFormat::Jpeg,
                quality: 85,
            },
        )
        .map_err(|e| e.to_string())?;
        let len = encoded.len() as u64;
        Ok(PreviewResult {
            data_url: format!(
                "data:image/jpeg;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(encoded)
            ),
            bytes: len,
            in_bytes: 0, // stitch has no single "before" to compare against
        })
    })
    .await
    .map_err(|e| format!("preview failed: {e}"))?
}

#[tauri::command]
pub fn batch_cancel(state: State<'_, AppState>) {
    use std::sync::atomic::Ordering;
    let slot = state.active_batch.lock().unwrap();
    if let Some(cancel) = slot.as_ref() {
        cancel.store(true, Ordering::Relaxed);
    }
}

#[derive(Serialize)]
pub struct EditImageResult {
    pub image_b64: String,
    pub mime: String,
}

#[derive(Serialize)]
pub struct EditResult {
    /// One entry per requested image (n=1 → single entry).
    pub images: Vec<EditImageResult>,
    pub revised_prompt: Option<String>,
}

fn to_edit_result(resp: api::client::EditResponse) -> EditResult {
    use base64::Engine;
    EditResult {
        images: resp
            .images
            .into_iter()
            .map(|img| EditImageResult {
                image_b64: base64::engine::general_purpose::STANDARD.encode(img.image),
                mime: img.mime,
            })
            .collect(),
        revised_prompt: resp.revised_prompt,
    }
}

/// Text-to-image generation — no source image needed.
#[tauri::command]
pub async fn ai_generate(
    app: AppHandle,
    state: State<'_, AppState>,
    model: String,
    prompt: String,
    size: Option<String>,
    quality: Option<String>,
    n: Option<u8>,
) -> Result<EditResult, String> {
    let settings = state.settings.lock().unwrap().clone();
    let api_key = api_key::get(&app)
        .ok_or_else(|| "no API key configured — add one in Settings first".to_string())?;

    let resp = api::client::generate_image(
        // Text-to-image runs against its own gateway.
        &settings.base_url_t2i,
        &api_key,
        &model,
        &prompt,
        size.as_deref(),
        quality.as_deref(),
        n,
    )
    .await?;

    Ok(to_edit_result(resp))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn ai_edit(
    app: AppHandle,
    state: State<'_, AppState>,
    model: String,
    prompt: String,
    image_paths: Vec<String>,
    mask_b64: Option<String>,
    size: Option<String>,
    quality: Option<String>,
    n: Option<u8>,
) -> Result<EditResult, String> {
    let settings = state.settings.lock().unwrap().clone();
    use base64::Engine;
    let api_key = api_key::get(&app)
        .ok_or_else(|| "no API key configured — add one in Settings first".to_string())?;

    if image_paths.is_empty() {
        return Err("no image provided".into());
    }
    if image_paths.len() > guard::limits::MAX_AI_IMAGES {
        return Err(format!(
            "too many images ({}); the limit is {}",
            image_paths.len(),
            guard::limits::MAX_AI_IMAGES
        ));
    }
    if prompt.chars().count() > guard::limits::MAX_PROMPT_CHARS {
        return Err(format!(
            "prompt is too long ({} chars); the limit is {}",
            prompt.chars().count(),
            guard::limits::MAX_PROMPT_CHARS
        ));
    }
    let mut images: Vec<(Vec<u8>, String)> = Vec::with_capacity(image_paths.len());
    for path in &image_paths {
        if !guard::has_no_parent_traversal(path) {
            return Err(format!("unsafe image path: {path}"));
        }
        guard::validate_input_file(std::path::Path::new(path)).map_err(|e| e.to_string())?;
        let bytes = std::fs::read(path).map_err(|e| format!("cannot read image {path}: {e}"))?;
        let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
        let mime = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            _ => "image/png",
        };
        images.push((bytes, mime.to_string()));
    }

    let mask = match mask_b64.as_deref() {
        None => None,
        Some(b64) => Some(
            base64::engine::general_purpose::STANDARD
                .decode(b64)
                .map_err(|e| format!("invalid mask data: {e}"))?,
        ),
    };

    let resp = api::client::edit_image(
        &settings.base_url,
        &api_key,
        api::client::EditRequest {
            model: &model,
            prompt: &prompt,
            images: &images,
            mask: mask.as_deref(),
            size: size.as_deref(),
            quality: quality.as_deref(),
            n,
        },
    )
    .await?;

    Ok(to_edit_result(resp))
}

#[derive(Serialize)]
pub struct TestResult {
    /// Models visible on the image-edits gateway.
    pub models: Vec<String>,
    /// Models visible on the text-to-image gateway.
    pub models_t2i: Vec<String>,
}

#[tauri::command]
pub async fn api_test(
    app: AppHandle,
    state: State<'_, AppState>,
    base_url: Option<String>,
    base_url_t2i: Option<String>,
    api_key: Option<String>,
) -> Result<TestResult, String> {
    let settings = state.settings.lock().unwrap().clone();
    let base = base_url.unwrap_or(settings.base_url);
    let base_t2i = base_url_t2i.unwrap_or(settings.base_url_t2i);
    // A freshly typed key wins (Settings tests before saving); otherwise
    // fall back to the stored one.
    let key = api_key
        .filter(|k| !k.trim().is_empty())
        .map(|k| k.trim().to_string())
        .or_else(|| api_key::get(&app))
        .ok_or_else(|| "no API key configured — add one in Settings first".to_string())?;
    // Both gateways must answer — each AI tool depends on one of them.
    let edits = api::client::test_key(&base, &key)
        .await
        .map_err(|e| format!("image-edits endpoint ({base}): {e}"))?;
    let t2i = api::client::test_key(&base_t2i, &key)
        .await
        .map_err(|e| format!("text-to-image endpoint ({base_t2i}): {e}"))?;
    Ok(TestResult {
        models: edits.models,
        models_t2i: t2i.models,
    })
}

#[tauri::command]
pub fn api_key_status(app: AppHandle) -> bool {
    api_key::get(&app).is_some()
}

#[tauri::command]
pub fn api_key_set(app: AppHandle, key: String) -> Result<(), String> {
    let key = key.trim().to_string();
    if key.len() < 8 {
        return Err("this does not look like a valid API key".into());
    }
    api_key::set(&app, &key)
}

#[tauri::command]
pub fn api_key_clear(app: AppHandle) -> Result<(), String> {
    api_key::clear(&app)
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    mut settings: Settings,
) -> Result<(), String> {
    // Normalize BEFORE persisting and use the SAME normalized value for the
    // in-memory state — previously the disk copy was normalized while memory
    // kept the raw input, so the current session behaved differently from a
    // restarted one (e.g. an empty t2i URL erroring until relaunch).
    settings.normalize();
    crate::settings::save(&app, &settings)?;
    *state.settings.lock().unwrap() = settings;
    Ok(())
}

#[tauri::command]
pub fn save_bytes(path: String, data_b64: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data_b64)
        .map_err(|e| format!("invalid data: {e}"))?;
    // Full guard: parent must be a real directory (or be creatable), the
    // file name must be a safe component — no silent create_dir failures.
    let out =
        guard::validate_output_path(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    if let Some(parent) = out.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("cannot create folder {}: {e}", parent.display()))?;
        }
    }
    // Crash-safe commit: a failed write must never truncate an existing file
    // (e.g. an AI result saved over a previous export).
    match engine_output::write_output(&out, &bytes, batch::Collision::Overwrite, &[]) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
