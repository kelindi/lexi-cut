use crate::services::extract_thumbnail;
use std::path::Path;

#[tauri::command]
pub async fn generate_thumbnail(video_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || extract_thumbnail(Path::new(&video_path)))
        .await
        .map_err(|e| e.to_string())?
}
