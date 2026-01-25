use base64::{engine::general_purpose::STANDARD, Engine};
use std::fs;
use std::process::Command;
use tempfile::NamedTempFile;

/// Extract the first N seconds of a video and return as base64-encoded MP4
///
/// This is used to send a small clip to Gemini for video understanding
/// instead of the full video, which can be large and cause processing issues.
#[tauri::command]
pub async fn extract_clip_base64(
    path: String,
    duration_seconds: f64,
) -> Result<String, String> {
    let duration = if duration_seconds <= 0.0 {
        5.0
    } else {
        duration_seconds
    };

    // Create a temp file for the output MP4
    let temp_file = NamedTempFile::with_suffix(".mp4")
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    let temp_path = temp_file.path().to_string_lossy().to_string();

    println!(
        "[extract_clip] Extracting first {:.1}s from {} -> {}",
        duration, path, temp_path
    );

    // Use ffmpeg to extract the first N seconds and convert to MP4 (H.264)
    // Re-encoding ensures compatibility with Gemini
    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-ss", "0",
            "-i", &path,
            "-t", &format!("{:.3}", duration),
            "-c:v", "libx264",      // H.264 video codec
            "-preset", "ultrafast", // Fast encoding
            "-crf", "23",           // Reasonable quality
            "-c:a", "aac",          // AAC audio codec
            "-b:a", "128k",
            "-movflags", "+faststart", // Enable streaming
            &temp_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg clip extraction failed: {}", stderr));
    }

    // Read the output file and encode as base64
    let bytes = fs::read(&temp_path)
        .map_err(|e| format!("Failed to read temp file: {}", e))?;

    let size_mb = bytes.len() as f64 / 1024.0 / 1024.0;
    println!(
        "[extract_clip] Extracted clip size: {:.2}MB",
        size_mb
    );

    Ok(STANDARD.encode(&bytes))
}
