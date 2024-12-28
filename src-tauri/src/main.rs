// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;

use dotenv::dotenv;
use std::env;
use tauri_plugin_fs; // To access environment variables

use ai::proofread::proofread_content;
use ai::review::ai_review;
use ai::suggestions::ai_suggestions;

fn main() {
    dotenv().ok(); // Load the .env file

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            proofread_content,
            ai_suggestions,
            ai_review
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
