//! App update check + installer download against the GitHub release feed.
//!
//! The repo must be publicly readable for the unauthenticated API call to
//! work; failures surface as plain errors the UI shows next to the button.

use serde::Serialize;

const RELEASES_API: &str =
    "https://api.github.com/repos/BrushLLM/brushllm-image-studio/releases/latest";

#[derive(Serialize, Clone)]
pub struct UpdateAsset {
    pub name: String,
    pub url: String,
    pub size: u64,
}

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub notes: String,
    pub assets: Vec<UpdateAsset>,
    pub update_available: bool,
    pub release_url: String,
}

/// Numeric version comparison ("0.0.2" > "0.0.1", "0.10.0" > "0.9.9").
/// Non-numeric suffixes are ignored, so "1.2.3-beta" compares as 1.2.3.
fn is_newer(latest: &str, current: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.trim_start_matches('v')
            .split('.')
            .map(|part| {
                part.chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
                    .parse::<u64>()
                    .unwrap_or(0)
            })
            .collect()
    };
    let (l, c) = (parse(latest), parse(current));
    for i in 0..l.len().max(c.len()) {
        let lv = l.get(i).copied().unwrap_or(0);
        let cv = c.get(i).copied().unwrap_or(0);
        if lv != cv {
            return lv > cv;
        }
    }
    false
}

fn http_client() -> Result<reqwest::Client, String> {
    // GitHub rejects API requests without a User-Agent.
    reqwest::Client::builder()
        .user_agent(concat!("BrushLLM-Studio/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("cannot build HTTP client: {e}"))
}

#[tauri::command]
pub async fn check_update() -> Result<UpdateInfo, String> {
    let resp = http_client()?
        .get(RELEASES_API)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    if !resp.status().is_success() {
        // 404 on a private repo is the common case — name it explicitly.
        return Err(format!(
            "release lookup failed (HTTP {}) — the repository must be public for update checks",
            resp.status()
        ));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("invalid release response: {e}"))?;

    let latest = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim_start_matches('v')
        .to_string();
    let notes = json
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let release_url = json
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or("https://github.com/BrushLLM/brushllm-image-studio/releases")
        .to_string();
    let assets = json
        .get("assets")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let state = a.get("state").and_then(|s| s.as_str()).unwrap_or("");
                    if state != "uploaded" {
                        return None;
                    }
                    Some(UpdateAsset {
                        name: a
                            .get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or("")
                            .to_string(),
                        url: a
                            .get("browser_download_url")
                            .and_then(|u| u.as_str())
                            .unwrap_or("")
                            .to_string(),
                        size: a.get("size").and_then(|s| s.as_u64()).unwrap_or(0),
                    })
                })
                .filter(|a| !a.name.is_empty() && !a.url.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let current = env!("CARGO_PKG_VERSION").to_string();
    let update_available = !latest.is_empty() && is_newer(&latest, &current);
    Ok(UpdateInfo {
        current,
        latest,
        notes,
        assets,
        update_available,
        release_url,
    })
}

#[cfg(test)]
mod tests {
    use super::is_newer;

    #[test]
    fn version_ordering() {
        assert!(is_newer("0.0.2", "0.0.1"));
        assert!(is_newer("v1.0.0", "0.9.9"));
        assert!(is_newer("0.10.0", "0.9.9"));
        assert!(!is_newer("0.0.1", "0.0.1"));
        assert!(!is_newer("0.0.1", "0.0.2"));
        assert!(!is_newer("1.2.3-beta", "1.2.3"));
        assert!(is_newer("1.2.4-beta", "1.2.3"));
    }
}
