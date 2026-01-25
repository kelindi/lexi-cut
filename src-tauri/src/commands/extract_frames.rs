use base64::{engine::general_purpose::STANDARD, Engine};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tempfile::TempDir;

/// A single extracted frame with its timestamp
#[derive(serde::Serialize)]
pub struct ExtractedFrame {
    /// Timestamp in seconds
    pub timestamp: f64,
    /// Base64-encoded JPEG image data
    pub data: String,
}

/// Extract frames from a video at 1 frame per second
///
/// Returns an array of base64-encoded JPEG frames with timestamps.
/// This is used for Gemini image-based video understanding.
#[tauri::command]
pub async fn extract_frames_base64(
    path: String,
    max_frames: Option<u32>,
) -> Result<Vec<ExtractedFrame>, String> {
    let max = max_frames.unwrap_or(30); // Default to max 30 frames

    // Create a temp directory for the frames
    let temp_dir = TempDir::new()
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    let temp_path = temp_dir.path();

    let output_pattern = temp_path.join("frame_%04d.jpg");
    let output_pattern_str = output_pattern.to_string_lossy().to_string();

    println!(
        "[extract_frames] Extracting frames at 1fps from {} (max: {})",
        path, max
    );

    // Use ffmpeg to extract frames at 1 fps
    // -vf fps=1 extracts 1 frame per second
    // -vframes limits total frames
    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", &path,
            "-vf", "fps=1",
            "-vframes", &max.to_string(),
            "-q:v", "2", // High quality JPEG
            &output_pattern_str,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg frame extraction failed: {}", stderr));
    }

    // Read all extracted frames and encode as base64
    let mut frames: Vec<ExtractedFrame> = Vec::new();
    let mut frame_num = 1u32;

    loop {
        let frame_path: PathBuf = temp_path.join(format!("frame_{:04}.jpg", frame_num));

        if !frame_path.exists() {
            break;
        }

        let bytes = fs::read(&frame_path)
            .map_err(|e| format!("Failed to read frame {}: {}", frame_num, e))?;

        frames.push(ExtractedFrame {
            timestamp: (frame_num - 1) as f64, // 0-indexed timestamp
            data: STANDARD.encode(&bytes),
        });

        frame_num += 1;

        if frame_num > max {
            break;
        }
    }

    println!(
        "[extract_frames] Extracted {} frames",
        frames.len()
    );

    Ok(frames)
}
