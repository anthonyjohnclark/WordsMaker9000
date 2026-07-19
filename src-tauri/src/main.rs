// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod context_menu;
mod export;

use tauri_plugin_fs;

use export::{export_project, list_project_exports, open_file_default};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
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
            open_file_default
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
