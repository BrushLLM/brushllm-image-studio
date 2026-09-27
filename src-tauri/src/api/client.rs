//! BrushLLM API client. Every assumption about the gateway's contract lives in
//! this one module — if the endpoint shape changes, edit here only.

use base64::Engine;
use serde::Deserialize;

pub const DEFAULT_BASE_URL: &str = "https://api.brushllm.com/v1";

const EDIT_TIMEOUT_SECS: u64 = 300;
const PROBE_TIMEOUT_SECS: u64 = 15;

fn client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .user_agent("BrushLLM-Studio/0.0.1")
        .build()
        .map_err(|e| format!("cannot create HTTP client: {e}"))
}

pub struct EditRequest<'a> {
    pub model: &'a str,
    pub prompt: &'a str,
    /// (bytes, mime) pairs. The FIRST entry is the primary image; extra
    /// entries are reference images sent as repeated `image[]` parts
    /// (gateway docs: single image uses `image`, several use `image[]` —
    /// only some models support multi-image).
    pub images: &'a [(Vec<u8>, String)],
    /// PNG mask: TRANSPARENT pixels mark the region to regenerate (OpenAI
    /// edits semantics); opaque areas are preserved.
    pub mask: Option<&'a [u8]>,
    pub size: Option<&'a str>,
    /// "low" | "medium" | "high"; None = model default (auto).
    pub quality: Option<&'a str>,
    /// Number of images to generate.
    pub n: Option<u8>,
}

pub struct EditImage {
    pub image: Vec<u8>,
    pub mime: String,
}

pub struct EditResponse {
    /// One entry per requested image (n=1 → single entry).
    pub images: Vec<EditImage>,
    pub revised_prompt: Option<String>,
}

/// Ask the gateway to regenerate an image. Assumes an OpenAI-compatible
/// `POST {base}/images/edits` multipart endpoint.
pub async fn edit_image(base_url: &str, api_key: &str, req: EditRequest<'_>) -> Result<EditResponse, String> {
    let url = format!("{}/images/edits", base_url.trim_end_matches('/'));

    let mut form = reqwest::multipart::Form::new()
        .text("model", req.model.to_string())
        .text("prompt", req.prompt.to_string())
        .text("response_format", "b64_json".to_string());
    if let Some(size) = req.size {
        form = form.text("size", size.to_string());
    }
    if let Some(quality) = req.quality {
        form = form.text("quality", quality.to_string());
    }
    if let Some(n) = req.n {
        form = form.text("n", n.to_string());
    }

    // Single image → field name `image` (exact wire format as before);
    // several → repeated `image[]` parts, first = primary image.
    let multi = req.images.len() > 1;
    for (index, (bytes, mime)) in req.images.iter().enumerate() {
        let ext = match mime.as_str() {
            "image/jpeg" => "jpg",
            "image/webp" => "webp",
            _ => "png",
        };
        let part = reqwest::multipart::Part::bytes(bytes.clone())
            .file_name(format!("image{index}.{ext}"))
            .mime_str(mime)
            .map_err(|e| format!("invalid image mime: {e}"))?;
        let field = if multi { "image[]" } else { "image" };
        form = form.part(field, part);
    }

    if let Some(mask) = req.mask {
        let mask_part = reqwest::multipart::Part::bytes(mask.to_vec())
            .file_name("mask.png".to_string())
            .mime_str("image/png")
            .map_err(|e| format!("invalid mask mime: {e}"))?;
        form = form.part("mask", mask_part);
    }

    let http = client(EDIT_TIMEOUT_SECS)?;
    let resp = http
        .post(&url)
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(friendly_error(status.as_u16(), &body));
    }
    parse_image_response(resp).await
}

#[derive(serde::Serialize)]
pub struct ProbeResult {
    pub models: Vec<String>,
}

/// Text-to-image generation (no source image).
pub async fn generate_image(
    base_url: &str,
    api_key: &str,
    model: &str,
    prompt: &str,
    size: Option<&str>,
    quality: Option<&str>,
    n: Option<u8>,
) -> Result<EditResponse, String> {
    let url = format!("{}/images/generations", base_url.trim_end_matches('/'));
    let mut body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "response_format": "b64_json",
    });
    if let Some(size) = size {
        body["size"] = serde_json::json!(size);
    }
    if let Some(quality) = quality {
        body["quality"] = serde_json::json!(quality);
    }
    if let Some(n) = n {
        body["n"] = serde_json::json!(n);
    }
    let resp = client(EDIT_TIMEOUT_SECS)?
        .post(&url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(friendly_error(status.as_u16(), &body));
    }
    parse_image_response(resp).await
}

async fn parse_image_response(resp: reqwest::Response) -> Result<EditResponse, String> {
    #[derive(Deserialize)]
    struct ApiItem {
        b64_json: Option<String>,
        url: Option<String>,
        revised_prompt: Option<String>,
    }
    #[derive(Deserialize)]
    struct ApiResponse {
        data: Vec<ApiItem>,
    }

    let parsed: ApiResponse = resp
        .json()
        .await
        .map_err(|e| format!("unexpected response format: {e}"))?;
    if parsed.data.is_empty() {
        return Err("the API returned no image".to_string());
    }
    let revised_prompt = parsed.data.iter().find_map(|i| i.revised_prompt.clone());

    let mut images = Vec::new();
    for item in &parsed.data {
        if let Some(b64) = &item.b64_json {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(b64)
                .map_err(|e| format!("invalid base64 image: {e}"))?;
            let mime = sniff_mime(&bytes);
            images.push(EditImage {
                image: bytes,
                mime,
            });
        } else if let Some(remote_url) = &item.url {
            // URL results are downloaded synchronously (DALL-E style).
            let img_resp = client(EDIT_TIMEOUT_SECS)?
                .get(remote_url)
                .send()
                .await
                .map_err(|e| format!("cannot download result image: {e}"))?;
            if !img_resp.status().is_success() {
                return Err(format!("result image download failed: {}", img_resp.status()));
            }
            let mime = img_resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.split(';').next().unwrap_or(s).to_string())
                .filter(|s| s.starts_with("image/"))
                .unwrap_or_else(|| "image/png".to_string());
            let image = img_resp
                .bytes()
                .await
                .map_err(|e| format!("download interrupted: {e}"))?;
            images.push(EditImage {
                image: image.to_vec(),
                mime,
            });
        }
    }
    if images.is_empty() {
        return Err("the API returned neither an image nor a URL".into());
    }
    Ok(EditResponse {
        images,
        revised_prompt,
    })
}

/// Verify the key by listing models (free call on OpenAI-compatible gateways).
pub async fn test_key(base_url: &str, api_key: &str) -> Result<ProbeResult, String> {
    let url = format!("{}/models", base_url.trim_end_matches('/'));
    let resp = client(PROBE_TIMEOUT_SECS)?
        .get(&url)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(friendly_error(status.as_u16(), &body));
    }
    #[derive(Deserialize)]
    struct ModelsResponse {
        data: Vec<ModelsItem>,
    }
    #[derive(Deserialize)]
    struct ModelsItem {
        id: String,
    }
    let parsed: ModelsResponse = resp
        .json()
        .await
        .map_err(|e| format!("unexpected response format: {e}"))?;
    Ok(ProbeResult {
        models: parsed.data.into_iter().map(|m| m.id).collect(),
    })
}

fn friendly_error(code: u16, body: &str) -> String {
    let truncated: String = body.chars().take(300).collect();
    match code {
        401 => format!("invalid API key (401). {truncated}"),
        402 => format!("insufficient balance (402). Top up at brushllm.com. {truncated}"),
        404 => format!("model or endpoint not found (404). Check the model id. {truncated}"),
        429 => format!("rate limit reached (429). Wait a moment and retry. {truncated}"),
        _ => format!("API error ({code}). {truncated}"),
    }
}

fn sniff_mime(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png".into()
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        "image/jpeg".into()
    } else if bytes.starts_with(b"RIFF") && bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
        "image/webp".into()
    } else {
        "image/png".into()
    }
}
