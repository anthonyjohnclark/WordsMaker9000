use crate::ai::common::{create_client, get_api_key, OpenAIResponse};

#[tauri::command]
pub async fn ai_review(content: String) -> Result<OpenAIResponse, String> {
    let api_key = get_api_key()?;
    let client = create_client();

    let system_role_content = std::env::var("REVIEW_SYSTEM_ROLE")
        .unwrap_or_else(|_| "You are an expert content reviewer. Provide detailed feedback on the following content:".to_string());

    let body = serde_json::json!({
        "model": "gpt-3.5-turbo",
        "messages": [
            { "role": "system", "content": system_role_content },
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
    let review_feedback = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(OpenAIResponse {
        result: review_feedback,
    })
}
