// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod context_menu;
mod export;
mod publishing;

use tauri_plugin_fs;

use export::{export_project, list_project_exports, open_file_default};
use publishing::assets::{
    cleanup_project_assets, import_project_asset, list_project_assets, remove_project_asset,
    replace_project_asset,
};
use publishing::service::{
    cancel_publish, copy_publication_artifact, delete_publication_history_entry,
    delete_publishing_profile, get_publishing_setup, list_publication_history, publish_project,
    regenerate_publication, reveal_publication_artifact, save_publishing_profile,
};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Spike: attach the WebView2 context-menu logger to the main window.
            if let Some(window) = app.get_webview_window("main") {
                context_menu::attach_context_menu_logger(&window);
            } else {
                eprintln!("[context-menu] main window not found during setup");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            export_project,
            list_project_exports,
            open_file_default,
            get_publishing_setup,
            publish_project,
            list_publication_history,
            cancel_publish,
            save_publishing_profile,
            delete_publishing_profile,
            copy_publication_artifact,
            reveal_publication_artifact,
            delete_publication_history_entry,
            regenerate_publication,
            list_project_assets,
            import_project_asset,
            replace_project_asset,
            remove_project_asset,
            cleanup_project_assets
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
