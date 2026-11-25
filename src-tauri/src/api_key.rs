//! API key storage in macOS Keychain or Windows Credential Manager.

const SERVICE: &str = "BrushLLM Studio";
const ACCOUNT: &str = "api_key";

#[cfg(target_os = "macos")]
pub fn exists() -> bool {
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

#[cfg(not(target_os = "macos"))]
pub fn exists() -> bool {
    get().is_some()
}

/// OS credential APIs may wait for an interactive unlock. They must never
/// run on the WebView's main thread or occupy an async runtime worker.
pub async fn load() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(get)
        .await
        .map_err(|e| format!("keychain task failed: {e}"))?
        .ok_or_else(|| "no API key configured — add one in Settings first".into())
}

fn get() -> Option<String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).ok()?;
    entry.get_password().ok()
}

pub fn set(key: &str) -> Result<(), String> {
    let entry =
        keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("keychain error: {e}"))?;
    entry
        .set_password(key)
        .map_err(|e| format!("cannot store API key: {e}"))
}

pub fn clear() -> Result<(), String> {
    let entry =
        keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("keychain error: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("cannot remove API key: {e}")),
    }
}
