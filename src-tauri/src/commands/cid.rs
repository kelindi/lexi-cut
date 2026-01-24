use crate::services::compute_file_hash;
use std::path::Path;

#[tauri::command]
pub async fn generate_cid(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || compute_file_hash(Path::new(&path)))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}
