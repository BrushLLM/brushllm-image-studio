//! API key storage. Desktop keeps it in the OS keychain (macOS Keychain /
//! Windows Credential Manager); Android/iOS have no keychain crate support,
//! so there it lives in a plain file inside the app's private config dir.

const SERVICE: &str = "BrushLLM Studio";
const ACCOUNT: &str = "api_key";

#[cfg(all(desktop, target_os = "macos"))]
pub fn exists(_app: &tauri::AppHandle) -> bool {
    use security_framework::{
        item::{ItemClass, ItemSearchOptions, Limit},
        os::macos::keychain::{SecKeychain, SecPreferencesDomain},
    };
    let Ok(keychain) = SecKeychain::default_for_domain(SecPreferencesDomain::User) else {
        return false;
    };
    ItemSearchOptions::new()
        .keychains(&[keychain])
        .class(ItemClass::generic_password())
        .service(SERVICE)
        .account(ACCOUNT)
        .limit(Limit::Max(1))
        .load_refs(true)
        .load_data(false)
        .skip_authenticated_items(true)
        .search()
        .is_ok_and(|items| !items.is_empty())
}

#[cfg(all(desktop, not(target_os = "macos")))]
pub fn exists(app: &tauri::AppHandle) -> bool {
    get(app).is_some()
}

#[cfg(mobile)]
pub fn exists(app: &tauri::AppHandle) -> bool {
    key_path(app).is_some_and(|path| path.is_file())
}

/// OS credential APIs may wait for an interactive unlock. They must never
/// run on the WebView's main thread or occupy an async runtime worker.
pub async fn load(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || get(&app))
        .await
        .map_err(|e| format!("keychain task failed: {e}"))?
        .ok_or_else(|| "no API key configured — add one in Settings first".into())
}

#[cfg(desktop)]
pub fn get(_app: &tauri::AppHandle) -> Option<String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).ok()?;
    entry.get_password().ok()
}

#[cfg(desktop)]
pub fn set(_app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let entry =
        keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("keychain error: {e}"))?;
    entry
        .set_password(key)
        .map_err(|e| format!("cannot store API key: {e}"))
}

#[cfg(desktop)]
pub fn clear(_app: &tauri::AppHandle) -> Result<(), String> {
    let entry =
        keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("keychain error: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("cannot remove API key: {e}")),
    }
}

/// Mobile fallback: `<app_config_dir>/api_key.txt`. The directory is private
/// to the app sandbox on both Android and iOS.
#[cfg(mobile)]
fn key_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("api_key.txt"))
}

#[cfg(mobile)]
pub fn get(app: &tauri::AppHandle) -> Option<String> {
    let path = key_path(app)?;
    let key = std::fs::read_to_string(path).ok()?;
    let trimmed = key.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(mobile)]
pub fn set(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let path = key_path(app).ok_or_else(|| "cannot determine config dir".to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("cannot create config dir: {e}"))?;
    }
    std::fs::write(&path, key).map_err(|e| format!("cannot store API key: {e}"))
}

#[cfg(mobile)]
pub fn clear(app: &tauri::AppHandle) -> Result<(), String> {
    let path = key_path(app).ok_or_else(|| "cannot determine config dir".to_string())?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("cannot remove API key: {e}")),
    }
}
