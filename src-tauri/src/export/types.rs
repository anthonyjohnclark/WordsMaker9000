use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ExportFileNode {
    pub id: i64,
    pub parent: i64,
    pub text: String,
    pub file_type: String,
    pub content: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ExportOptions {
    pub title: String,
    pub author: String,
    pub front_matter: Option<String>,
    pub back_matter: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ExportPayload {
    pub project_name: String,
    pub nodes: Vec<ExportFileNode>,
    pub options: ExportOptions,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportResult {
    pub success: bool,
    pub output_path: Option<String>,
    pub error: Option<String>,
}
