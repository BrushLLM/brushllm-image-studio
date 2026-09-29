use serde::{Deserialize, Serialize};

use crate::api::client::DEFAULT_BASE_URL;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// Base URL for image EDITS (every AI tool except Generate Image).
    pub base_url: String,
    /// Base URL for text-to-image GENERATIONS (Generate Image).
    #[serde(default)]
    pub base_url_t2i: String,
    pub default_model: String,
    /// Default output folder for all tools; None = next to each source image.
    #[serde(default)]
    pub output_dir: Option<String>,
    /// UI theme: "system" | "light" | "dark".
    #[serde(default)]
    pub appearance: String,
    /// UI language: "system" | "en" | "ja" | "de" | "ko" | "zh-CN" | "zh-TW".
    #[serde(default)]
    pub language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            base_url: DEFAULT_BASE_URL.to_string(),
            base_url_t2i: DEFAULT_BASE_URL.to_string(),
            default_model: "gpt-image-2".to_string(),
            output_dir: None,
            appearance: "system".to_string(),
            language: "system".to_string(),
        }
    }
}

fn config_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("settings.json"))
}

pub fn load(app: &tauri::AppHandle) -> Settings {
    let Some(path) = config_path(app) else {
        return Settings::default();
    };
    let loaded: Option<Settings> = std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok());
    // Migrate + normalize on every load so old files gain defaults and
    // whitespace/empty values never leak into requests.
    loaded
        .map(|mut s| {
            s.normalize();
            s
        })
        .unwrap_or_default()
}

impl Settings {
    /// Fill missing fields with defaults, trim URLs and drop empty strings.
    pub fn normalize(&mut self) {
        let d = Settings::default();
        self.base_url = self.base_url.trim().to_string();
        if self.base_url.is_empty() {
            self.base_url = d.base_url;
        }
        self.base_url_t2i = self.base_url_t2i.trim().to_string();
        if self.base_url_t2i.is_empty() {
            self.base_url_t2i = self.base_url.clone();
        }
        self.default_model = self.default_model.trim().to_string();
        if self.default_model.is_empty() {
            self.default_model = d.default_model;
        }
        if self.appearance.is_empty() {
            self.appearance = d.appearance;
        }
        if self.language.is_empty() {
            self.language = d.language;
        }
    }
}

pub fn save(app: &tauri::AppHandle, settings: &Settings) -> Result<(), String> {
    let Some(path) = config_path(app) else {
        return Err("cannot determine config directory".into());
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("cannot create config dir: {e}"))?;
    }
    let mut normalized = settings.clone();
    normalized.normalize();
    let text = serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())?;
    // Atomic write: temp file + rename so an interrupted process never
    // leaves a half-written settings.json behind.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &text).map_err(|e| format!("cannot write settings: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("cannot finalize settings: {e}"))
}
