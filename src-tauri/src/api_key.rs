//! API key storage. Desktop keeps it in the OS keychain (macOS Keychain /
//! Windows Credential Manager); Android/iOS have no keychain crate support,
//! so there it lives in a plain file inside the app's private config dir.

const SERVICE: &str = "BrushLLM Studio";
const ACCOUNT: &str = "api_key";

#[cfg(desktop)]
pub fn get(_app: &tauri::AppHandle) -> Option<String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).ok()?;
    entry.get_password().ok()
}

#[cfg(desktop)]
pub fn set(_app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("keychain error: {e}"))?;
    entry
        .set_password(key)
        .map_err(|e| format!("cannot store API key: {e}"))
}

#[cfg(desktop)]
pub fn clear(_app: &tauri::AppHandle) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("keychain error: {e}"))?;
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
