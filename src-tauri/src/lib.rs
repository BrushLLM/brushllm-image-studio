mod api;
mod api_key;
mod commands;
mod engine;
mod settings;
mod update;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let loaded = settings::load(app.handle());
            app.manage(commands::AppState {
                settings: std::sync::Mutex::new(loaded),
                active_batch: std::sync::Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::run_batch,
            commands::batch_cancel,
            commands::run_stitch,
            commands::apply_overlay,
            commands::apply_exif,
            commands::read_exif,
            commands::read_asset,
            commands::file_meta,
            commands::pictures_dir,
            commands::preview_batch,
            commands::preview_stitch,
            commands::ai_edit,
            commands::ai_generate,
            commands::api_test,
            commands::api_key_status,
            commands::api_key_set,
            commands::api_key_clear,
            commands::get_settings,
            commands::save_settings,
            commands::save_bytes,
            update::check_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
