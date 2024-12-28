use crate::ai::common::{create_client, get_api_key, OpenAIResponse};
// AI Suggestions

#[tauri::command]
pub async fn ai_suggestions(content: String) -> Result<OpenAIResponse, String> {
    let api_key = get_api_key()?;
    let client = create_client();

    let body = serde_json::json!({
        "model": "gpt-3.5-turbo",
        "messages": [
            { "role": "system", "content": "You are an expert writing assistant. Provide suggestions for improvement to the following content:" },
            { "role": "user", "content": content }
        ]
    });

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let suggestions = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(OpenAIResponse {
        result: suggestions,
    })
}
