// src-tauri/src/ai/common.rs
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Serialize, Deserialize)]
pub struct OpenAIResponse {
    pub result: String,
}

// Function to fetch the OpenAI API key
pub fn get_api_key() -> Result<String, String> {
    env::var("OPENAI_API_KEY").map_err(|_| "API key not set".to_string())
}

// Initialize and return an HTTP client
pub fn create_client() -> Client {
    Client::new()
}
