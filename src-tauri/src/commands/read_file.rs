use base64::{engine::general_purpose::STANDARD, Engine};
use std::fs;

/// Read a file and return its contents as base64-encoded string
/// This is used to load local video files for transcription since
/// fetch() cannot access asset:// URLs in the browser context
#[tauri::command]
pub async fn read_file_base64(path: String) -> Result<String, String> {
    let path_for_error = path.clone();
    let bytes = tokio::task::spawn_blocking(move || fs::read(&path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to read file '{}': {}", path_for_error, e))?;

    Ok(STANDARD.encode(&bytes))
}
