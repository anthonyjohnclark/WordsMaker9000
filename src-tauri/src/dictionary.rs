use reqwest::{Client, StatusCode, Url};
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

const DICTIONARY_API_BASE: &str = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const DICTIONARY_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const DICTIONARY_REQUEST_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_WORD_LENGTH: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct DictionaryLookupError {
    code: String,
    message: String,
    status: Option<u16>,
}

impl DictionaryLookupError {
    fn new(code: &str, message: String, status: Option<StatusCode>) -> Self {
        Self {
            code: code.to_string(),
            message,
            status: status.map(|value| value.as_u16()),
        }
    }
}

#[tauri::command]
pub(crate) async fn lookup_dictionary_definition(
    word: String,
) -> Result<Value, DictionaryLookupError> {
    let word = word.trim();
    validate_word(word)?;

    let url = dictionary_url(word)?;
    let client = Client::builder()
        .connect_timeout(DICTIONARY_CONNECT_TIMEOUT)
        .timeout(DICTIONARY_REQUEST_TIMEOUT)
        .user_agent("WordsMaker9000/0.1")
        .build()
        .map_err(|error| {
            log::error!("Failed to initialize dictionary HTTP client: {error}");
            DictionaryLookupError::new(
                "DICTIONARY_CLIENT_ERROR",
                "Dictionary lookup could not start. Restart WordsMaker9000 and try again."
                    .to_string(),
                None,
            )
        })?;

    let response = client.get(url).send().await.map_err(transport_error)?;
    let status = response.status();
    if !status.is_success() {
        return Err(http_error(status, word));
    }

    let payload = response.json::<Value>().await.map_err(|error| {
        log::error!("Dictionary service returned invalid JSON: {error}");
        DictionaryLookupError::new(
            "DICTIONARY_INVALID_RESPONSE",
            "Dictionary service returned an unreadable response. Try again later.".to_string(),
            Some(status),
        )
    })?;

    validate_payload(payload, status)
}

fn validate_word(word: &str) -> Result<(), DictionaryLookupError> {
    if word.is_empty() {
        return Err(DictionaryLookupError::new(
            "DICTIONARY_INVALID_WORD",
            "No word selected.".to_string(),
            None,
        ));
    }
    if word.chars().count() > MAX_WORD_LENGTH {
        return Err(DictionaryLookupError::new(
            "DICTIONARY_INVALID_WORD",
            "The selected word is too long to look up.".to_string(),
            None,
        ));
    }
    Ok(())
}

fn dictionary_url(word: &str) -> Result<Url, DictionaryLookupError> {
    let mut url = Url::parse(DICTIONARY_API_BASE).map_err(|error| {
        log::error!("Invalid built-in dictionary URL: {error}");
        DictionaryLookupError::new(
            "DICTIONARY_CLIENT_ERROR",
            "Dictionary lookup could not start. Restart WordsMaker9000 and try again.".to_string(),
            None,
        )
    })?;
    {
        let mut segments = url.path_segments_mut().map_err(|_| {
            DictionaryLookupError::new(
                "DICTIONARY_CLIENT_ERROR",
                "Dictionary lookup could not start. Restart WordsMaker9000 and try again."
                    .to_string(),
                None,
            )
        })?;
        segments.pop_if_empty().push(word);
    }
    Ok(url)
}

fn transport_error(error: reqwest::Error) -> DictionaryLookupError {
    log::error!("Dictionary request failed: {error}");
    if error.is_timeout() {
        DictionaryLookupError::new(
            "DICTIONARY_TIMEOUT",
            "Dictionary request timed out. Try again.".to_string(),
            None,
        )
    } else if error.is_connect() {
        DictionaryLookupError::new(
            "DICTIONARY_NETWORK_ERROR",
            "Could not reach the dictionary service. Check your connection and try again."
                .to_string(),
            None,
        )
    } else {
        DictionaryLookupError::new(
            "DICTIONARY_REQUEST_ERROR",
            "Dictionary request failed before the service responded. Try again.".to_string(),
            None,
        )
    }
}

fn http_error(status: StatusCode, word: &str) -> DictionaryLookupError {
    match status {
        StatusCode::NOT_FOUND => DictionaryLookupError::new(
            "DICTIONARY_NOT_FOUND",
            format!("No definition found for \"{word}\"."),
            Some(status),
        ),
        StatusCode::TOO_MANY_REQUESTS => DictionaryLookupError::new(
            "DICTIONARY_RATE_LIMITED",
            "Dictionary service is busy (HTTP 429). Wait a moment and try again.".to_string(),
            Some(status),
        ),
        value if value.is_server_error() => DictionaryLookupError::new(
            "DICTIONARY_SERVICE_UNAVAILABLE",
            format!(
                "Dictionary service is temporarily unavailable (HTTP {}). Try again later.",
                value.as_u16()
            ),
            Some(value),
        ),
        value => DictionaryLookupError::new(
            "DICTIONARY_SERVICE_ERROR",
            format!(
                "Dictionary service rejected the request (HTTP {}). Try again later.",
                value.as_u16()
            ),
            Some(value),
        ),
    }
}

fn validate_payload(payload: Value, status: StatusCode) -> Result<Value, DictionaryLookupError> {
    if payload
        .as_array()
        .is_some_and(|entries| !entries.is_empty())
    {
        return Ok(payload);
    }

    Err(DictionaryLookupError::new(
        "DICTIONARY_INVALID_RESPONSE",
        "Dictionary service returned an unexpected response. Try again later.".to_string(),
        Some(status),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_the_word_as_one_url_path_segment() {
        let url = dictionary_url("rock/roll").expect("URL should be valid");
        assert_eq!(
            url.as_str(),
            "https://api.dictionaryapi.dev/api/v2/entries/en/rock%2Froll"
        );
    }

    #[test]
    fn classifies_not_found_rate_limit_and_upstream_failures() {
        assert_eq!(
            http_error(StatusCode::NOT_FOUND, "vinyl").code,
            "DICTIONARY_NOT_FOUND"
        );
        assert_eq!(
            http_error(StatusCode::TOO_MANY_REQUESTS, "vinyl").code,
            "DICTIONARY_RATE_LIMITED"
        );

        let unavailable = http_error(StatusCode::BAD_GATEWAY, "vinyl");
        assert_eq!(unavailable.code, "DICTIONARY_SERVICE_UNAVAILABLE");
        assert_eq!(unavailable.status, Some(502));
        assert!(unavailable.message.contains("HTTP 502"));
    }

    #[test]
    fn rejects_empty_or_non_array_success_payloads() {
        assert_eq!(
            validate_payload(Value::Array(vec![]), StatusCode::OK)
                .expect_err("empty array must fail")
                .code,
            "DICTIONARY_INVALID_RESPONSE"
        );
        assert_eq!(
            validate_payload(serde_json::json!({ "word": "vinyl" }), StatusCode::OK)
                .expect_err("object must fail")
                .code,
            "DICTIONARY_INVALID_RESPONSE"
        );
    }

    #[test]
    fn accepts_a_non_empty_definition_array() {
        let payload = serde_json::json!([{ "word": "vinyl", "meanings": [] }]);
        assert_eq!(
            validate_payload(payload.clone(), StatusCode::OK).expect("array should pass"),
            payload
        );
    }
}
