use crate::services::{extract_thumbnail, get_video_dimensions, get_video_duration};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct VideoDimensions {
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub async fn generate_thumbnail(video_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || extract_thumbnail(Path::new(&video_path)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_duration(video_path: String) -> Result<f64, String> {
    tokio::task::spawn_blocking(move || get_video_duration(Path::new(&video_path)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_dimensions(video_path: String) -> Result<VideoDimensions, String> {
    tokio::task::spawn_blocking(move || {
        let (width, height) = get_video_dimensions(Path::new(&video_path))?;
        Ok(VideoDimensions { width, height })
    })
    .await
    .map_err(|e| e.to_string())?
}
