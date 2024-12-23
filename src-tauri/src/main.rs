// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use dotenv::dotenv;
use reqwest::Client; // For making HTTP requests
use serde::{Deserialize, Serialize}; // For JSON serialization and deserialization
use std::env;
use tauri_plugin_fs; // To access environment variables

// Define the structure for the response from the Tauri command
#[derive(Serialize, Deserialize)]
struct OpenAIResponse {
    proofreadContent: String,
}

// Define the Tauri command to interact with OpenAI
#[tauri::command]
async fn proofread_content(content: String) -> Result<OpenAIResponse, String> {
    // Get the OpenAI API key from environment variables
    let api_key = env::var("OPENAI_API_KEY").map_err(|_| "API key not set")?;

    // Initialize the HTTP client
    let client = Client::new();
    let body = serde_json::json!({
        "model": "gpt-3.5-turbo",
        "messages": [
            { "role": "system", "content": "You are a professional editor. Proofread the content below and return it as clean HTML:" },
            { "role": "user", "content": content }
        ]
    });

    // Send the request to the OpenAI API
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // Parse the response
    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let proofread_content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(OpenAIResponse {
        proofreadContent: proofread_content,
    })
}

fn main() {
    dotenv().ok(); // Load the .env file

    tauri::Builder::default()
        // Initialize the tauri-plugin-fs plugin
        .plugin(tauri_plugin_fs::init())
        // Register the Tauri command
        .invoke_handler(tauri::generate_handler![proofread_content])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
