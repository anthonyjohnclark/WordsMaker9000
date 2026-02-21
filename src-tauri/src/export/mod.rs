pub mod compiler;
pub mod pdf_adapter;
pub mod types;

use compiler::compile;
use pdf_adapter::generate_pdf;
use types::{ExportPayload, ExportResult};

use tauri::AppHandle;
use tauri::Manager;

#[tauri::command]
pub fn open_file_default(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    Ok(())
}

#[derive(serde::Serialize)]
pub struct ExportEntry {
    pub filename: String,
    pub path: String,
    pub modified: String,
}

#[tauri::command]
pub async fn list_project_exports(
    app: AppHandle,
    project_name: String,
) -> Result<Vec<ExportEntry>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

    let exports_dir = app_data_dir
        .join("Projects")
        .join(&project_name)
        .join("exports");

    if !exports_dir.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<ExportEntry> = Vec::new();
    let read_dir = std::fs::read_dir(&exports_dir)
        .map_err(|e| format!("Failed to read exports directory: {}", e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("pdf") {
            let filename = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let modified = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| {
                    let datetime: chrono::DateTime<chrono::Local> = t.into();
                    datetime.format("%Y-%m-%d %H:%M:%S").to_string()
                })
                .unwrap_or_default();
            entries.push(ExportEntry {
                filename,
                path: path.to_string_lossy().to_string(),
                modified,
            });
        }
    }

    // Sort newest first
    entries.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(entries)
}

#[tauri::command]
pub async fn export_project(
    app: AppHandle,
    payload: ExportPayload,
) -> Result<ExportResult, String> {
    let compiled = compile(&payload).map_err(|e| e.to_string())?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

    let exports_dir = app_data_dir
        .join("Projects")
        .join(&payload.project_name)
        .join("exports");

    match generate_pdf(&compiled, &exports_dir) {
        Ok(path) => Ok(ExportResult {
            success: true,
            output_path: Some(path.to_string_lossy().to_string()),
            error: None,
        }),
        Err(e) => Ok(ExportResult {
            success: false,
            output_path: None,
            error: Some(e),
        }),
    }
}
