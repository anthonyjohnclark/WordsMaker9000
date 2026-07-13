// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod export;

use tauri_plugin_fs;

use export::{export_project, list_project_exports, open_file_default};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            export_project,
            list_project_exports,
            open_file_default
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
