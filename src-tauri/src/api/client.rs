//! BrushLLM API client. Every assumption about the gateway's contract lives in
//! this one module — if the endpoint shape changes, edit here only.

use base64::Engine;
use serde::Deserialize;

pub const DEFAULT_BASE_URL: &str = "https://api.brushllm.com/v1";

/// Validate a gateway base URL: http/https only, no credentials, no query
/// or fragment. Plain HTTP is allowed only for loopback and private-network
/// hosts (development gateways) — decided by the parsed IP, never by string
/// prefixes (which `10.evil.invalid` would slip past).
fn validate_base_url(base_url: &str) -> Result<reqwest::Url, String> {
    let trimmed = base_url.trim();
    if trimmed.is_empty() {
        return Err("API base URL is empty".into());
    }
    let url = reqwest::Url::parse(trimmed).map_err(|e| format!("invalid API base URL: {e}"))?;
    match url.scheme() {
        "https" => {}
        "http" => {
            let is_local = match url.host() {
                Some(url::Host::Domain(d)) => d == "localhost",
                Some(url::Host::Ipv4(ip)) => {
                    ip.is_loopback() || ip.is_private() || ip.is_link_local()
                }
                Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
                None => false,
            };
            if !is_local {
                return Err(
                    "API base URL must use https (plain http is only allowed for localhost)".into(),
                );
            }
        }
        other => {
            return Err(format!(
                "API base URL scheme must be http or https, got {other}"
            ))
        }
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("API base URL must not contain credentials".into());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("API base URL must not contain a query or fragment".into());
    }
    Ok(url)
}

/// Build a request URL from a validated base + path segment.
fn join_url(base_url: &str, path: &str) -> Result<reqwest::Url, String> {
    let mut url = validate_base_url(base_url)?;
    url.set_path(&format!("{}/{}", url.path().trim_matches('/'), path));
    Ok(url)
}

const EDIT_TIMEOUT_SECS: u64 = 300;
const PROBE_TIMEOUT_SECS: u64 = 15;
/// Hard cap on JSON / error bodies (a b64 image payload can be large, but a
/// gateway returning more than this is not something we can trust or parse).
const MAX_JSON_BYTES: u64 = 200 * 1024 * 1024;
/// Hard cap on a downloaded result image.
const MAX_DOWNLOAD_BYTES: u64 = 100 * 1024 * 1024;
/// Max images accepted in one response.
const MAX_RESPONSE_IMAGES: usize = 10;

fn client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .user_agent(concat!("BrushLLM-Studio/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("cannot create HTTP client: {e}"))
}

/// Client for downloading result images: every redirect hop must stay on
/// HTTPS so an https result URL cannot be downgraded to plain http.
fn download_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .user_agent(concat!("BrushLLM-Studio/", env!("CARGO_PKG_VERSION")))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.url().scheme() == "https" {
                attempt.follow()
            } else {
                // Refuse the hop: the request errors out instead of silently
                // fetching over plain http.
                attempt.stop()
            }
        }))
        .build()
        .map_err(|e| format!("cannot create HTTP client: {e}"))
}

/// Read a response body with a hard byte cap, aborting as soon as the limit
/// is crossed — a missing or forged Content-Length can no longer bypass it.
async fn read_bounded(
    mut resp: reqwest::Response,
    max: u64,
    what: &str,
) -> Result<Vec<u8>, String> {
    let mut body = Vec::new();
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("download interrupted: {e}"))?
    {
        body.extend_from_slice(&chunk);
        if body.len() as u64 > max {
            return Err(format!(
                "{what} exceeds the {} MB limit",
                max / (1024 * 1024)
            ));
        }
    }
    Ok(body)
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
pub async fn edit_image(
    base_url: &str,
    api_key: &str,
    req: EditRequest<'_>,
) -> Result<EditResponse, String> {
    let url = join_url(base_url, "images/edits")?;

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
        .post(url.as_str())
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body = String::from_utf8_lossy(
            &read_bounded(resp, 64 * 1024, "error body")
                .await
                .unwrap_or_default(),
        )
        .into_owned();
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
    let url = join_url(base_url, "images/generations")?;
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
        .post(url.as_str())
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body = String::from_utf8_lossy(
            &read_bounded(resp, 64 * 1024, "error body")
                .await
                .unwrap_or_default(),
        )
        .into_owned();
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

    // Bounded body read: a gateway streaming an unbounded JSON body (or a
    // chunked response with no Content-Length) cannot exhaust memory.
    let body = read_bounded(resp, MAX_JSON_BYTES, "API response").await?;
    let parsed: ApiResponse =
        serde_json::from_slice(&body).map_err(|e| format!("unexpected response format: {e}"))?;
    if parsed.data.is_empty() {
        return Err("the API returned no image".to_string());
    }
    if parsed.data.len() > MAX_RESPONSE_IMAGES {
        return Err(format!(
            "the API returned too many images ({}); the limit is {}",
            parsed.data.len(),
            MAX_RESPONSE_IMAGES
        ));
    }
    let revised_prompt = parsed.data.iter().find_map(|i| i.revised_prompt.clone());

    let mut images = Vec::new();
    for item in &parsed.data {
        if let Some(b64) = &item.b64_json {
            if b64.len() > 150 * 1024 * 1024 {
                return Err("base64 image exceeds the size limit".into());
            }
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(b64)
                .map_err(|e| format!("invalid base64 image: {e}"))?;
            let mime = sniff_mime_checked(&bytes)?;
            images.push(EditImage { image: bytes, mime });
        } else if let Some(remote_url) = &item.url {
            // URL results are downloaded synchronously (DALL-E style).
            // Only https URLs are followed; the response must be an image
            // and bounded in size.
            let dl =
                reqwest::Url::parse(remote_url).map_err(|e| format!("invalid result URL: {e}"))?;
            if dl.scheme() != "https" {
                return Err("result URL must use https".into());
            }
            if !dl.username().is_empty() || dl.password().is_some() {
                return Err("result URL must not contain credentials".into());
            }
            let img_resp = download_client(EDIT_TIMEOUT_SECS)?
                .get(dl.as_str())
                .send()
                .await
                .map_err(|e| format!("cannot download result image: {e}"))?;
            if !img_resp.status().is_success() {
                return Err(format!(
                    "result image download failed: {}",
                    img_resp.status()
                ));
            }
            // The final URL after redirects must still be https — the
            // custom redirect policy refuses plain-http hops, so a non-https
            // landing means the policy was bypassed and we refuse the data.
            if img_resp.url().scheme() != "https" {
                return Err("result image download was redirected away from https".into());
            }
            let mime = img_resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.split(';').next().unwrap_or(s).to_string())
                .filter(|s| s.starts_with("image/"))
                .ok_or("result URL did not return an image")?
                .to_string();
            // Streaming cap — a missing or lying Content-Length cannot
            // bypass it, and the read aborts as soon as the limit is crossed.
            let image = read_bounded(img_resp, MAX_DOWNLOAD_BYTES, "result image").await?;
            // Magic-number check: a text error page with an image
            // Content-Type is not a usable image.
            sniff_mime_checked(&image)?;
            images.push(EditImage { image, mime });
        }
    }
    if images.is_empty() {
        return Err("the API returned neither an image nor a URL".to_string());
    }
    Ok(EditResponse {
        images,
        revised_prompt,
    })
}

/// Verify the key by listing models (free call on OpenAI-compatible gateways).
pub async fn test_key(base_url: &str, api_key: &str) -> Result<ProbeResult, String> {
    let url = join_url(base_url, "models")?;
    let resp = client(PROBE_TIMEOUT_SECS)?
        .get(url.as_str())
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        let body = String::from_utf8_lossy(
            &read_bounded(resp, 64 * 1024, "error body")
                .await
                .unwrap_or_default(),
        )
        .into_owned();
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
    let body = read_bounded(resp, 16 * 1024 * 1024, "models response").await?;
    let parsed: ModelsResponse =
        serde_json::from_slice(&body).map_err(|e| format!("unexpected response format: {e}"))?;
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

/// Magic-number check: only real PNG/JPEG/WebP data counts as an image.
/// Empty payloads, plain text and truncated files are rejected instead of
/// being labeled "image/png" and handed to the UI as a success.
fn sniff_mime_checked(bytes: &[u8]) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("the API returned an empty image".into());
    }
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        Ok("image/png".into())
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        Ok("image/jpeg".into())
    } else if bytes.starts_with(b"RIFF") && bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
        Ok("image/webp".into())
    } else {
        Err("the API returned an unrecognized image format".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_allowed_only_for_real_local_hosts() {
        for ok in [
            "http://localhost:8000/v1",
            "http://127.0.0.1:8000/v1",
            "http://[::1]:8000/v1",
            "http://192.168.1.10/v1",
            "http://10.0.0.5/v1",
            "https://api.brushllm.com/v1",
            "https://example.com/v1",
        ] {
            assert!(validate_base_url(ok).is_ok(), "{ok} should be accepted");
        }
        // Numeric-prefix domains are NOT IP addresses — the old string-prefix
        // check let these through.
        for bad in [
            "http://127.evil.invalid/v1",
            "http://10.evil.invalid/v1",
            "http://192.168.evil.invalid/v1",
            "http://example.com/v1",
            "ftp://example.com/v1",
            "https://user:pass@example.com/v1",
            "https://example.com/v1?x=1",
        ] {
            assert!(validate_base_url(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn mime_check_rejects_non_images() {
        assert_eq!(
            sniff_mime_checked(&[0x89, b'P', b'N', b'G', 0, 0]).unwrap(),
            "image/png"
        );
        assert_eq!(
            sniff_mime_checked(&[0xFF, 0xD8, 0xFF, 0xE0]).unwrap(),
            "image/jpeg"
        );
        let mut webp = b"RIFF\x00\x00\x00\x00WEBPVP8 ".to_vec();
        webp.resize(16, 0);
        assert_eq!(sniff_mime_checked(&webp).unwrap(), "image/webp");
        assert!(sniff_mime_checked(b"").is_err());
        assert!(sniff_mime_checked(b"Hello").is_err());
        assert!(sniff_mime_checked(&[0x89, b'P', b'N']).is_err());
    }

    /// A chunked response with no Content-Length must hit the streaming cap
    /// instead of buffering forever.
    #[test]
    fn read_bounded_aborts_on_oversized_chunked_body() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            use std::io::Write;
            let (mut sock, _) = listener.accept().unwrap();
            let mut buf = [0u8; 4096];
            let _ = std::io::Read::read(&mut sock, &mut buf); // consume request
            let head = "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n";
            sock.write_all(head.as_bytes()).unwrap();
            // One 2 MB chunk — over the 1 MB cap we pass below.
            sock.write_all(format!("{:x}\r\n", 2 * 1024 * 1024).as_bytes())
                .unwrap();
            let block = vec![b'x'; 2 * 1024 * 1024];
            sock.write_all(&block).unwrap();
            sock.write_all(b"\r\n0\r\n\r\n").unwrap();
        });
        let fut = async move {
            let resp = reqwest::Client::new()
                .get(format!("http://127.0.0.1:{port}/"))
                .send()
                .await
                .unwrap();
            read_bounded(resp, 1024 * 1024, "test body").await
        };
        let result = tauri::async_runtime::block_on(fut);
        server.join().unwrap();
        assert!(result.is_err(), "oversized chunked body must be rejected");
    }
}
