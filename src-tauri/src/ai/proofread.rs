use crate::ai::common::{create_client, get_api_key, OpenAIResponse};

#[tauri::command]
pub async fn proofread_content(content: String) -> Result<OpenAIResponse, String> {
    let api_key = get_api_key()?;
    let client = create_client();

    let system_role_content = std::env::var("PROOFREAD_SYSTEM_ROLE")
        .unwrap_or_else(|_| "You are a professional editor. Proofread the content below and return it as clean HTML:".to_string());

    let body = serde_json::json!({
        "model": "gpt-3.5-turbo",
        "messages": [
            { "role": "system", "content": system_role_content },
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
        result: proofread_content,
    })
}
