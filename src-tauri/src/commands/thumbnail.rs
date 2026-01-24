use base64::{engine::general_purpose::STANDARD, Engine};
use std::process::Command;
use tempfile::NamedTempFile;

#[tauri::command]
pub async fn generate_thumbnail(video_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || generate_thumbnail_sync(&video_path))
        .await
        .map_err(|e| e.to_string())?
}

fn generate_thumbnail_sync(video_path: &str) -> Result<String, String> {
    let output_file = NamedTempFile::with_suffix(".jpg").map_err(|e| e.to_string())?;
    let output_path = output_file.path().to_string_lossy().to_string();

    let status = Command::new("ffmpeg")
        .args([
            "-ss",
            "1",
            "-i",
            video_path,
            "-frames:v",
            "1",
            "-vf",
            "scale=320:-1",
            "-q:v",
            "5",
            "-y",
            &output_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !status.status.success() {
        // Fallback: extract first frame for short videos
        let status = Command::new("ffmpeg")
            .args([
                "-i",
                video_path,
                "-frames:v",
                "1",
                "-vf",
                "scale=320:-1",
                "-q:v",
                "5",
                "-y",
                &output_path,
            ])
            .output()
            .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

        if !status.status.success() {
            return Err(format!(
                "ffmpeg failed: {}",
                String::from_utf8_lossy(&status.stderr)
            ));
        }
    }

    let image_data = std::fs::read(&output_path).map_err(|e| e.to_string())?;
    let base64_data = STANDARD.encode(&image_data);
    Ok(format!("data:image/jpeg;base64,{}", base64_data))
}
