use base64::{engine::general_purpose::STANDARD, Engine};
use std::path::Path;
use std::process::Command;
use tempfile::NamedTempFile;

pub fn extract_thumbnail(video_path: &Path) -> Result<String, String> {
    let output_file = NamedTempFile::with_suffix(".jpg").map_err(|e| e.to_string())?;
    let output_path = output_file.path().to_string_lossy().to_string();
    let video_path_str = video_path.to_string_lossy();

    if !try_extract_at_timestamp(&video_path_str, &output_path, "1")? {
        // Fallback: extract first frame for short videos
        if !try_extract_at_timestamp(&video_path_str, &output_path, "0")? {
            return Err("Failed to extract thumbnail".to_string());
        }
    }

    encode_image_to_data_uri(&output_path)
}

fn try_extract_at_timestamp(
    video_path: &str,
    output_path: &str,
    timestamp: &str,
) -> Result<bool, String> {
    let mut args = vec!["-i", video_path];

    if timestamp != "0" {
        args.insert(0, timestamp);
        args.insert(0, "-ss");
    }

    args.extend([
        "-frames:v",
        "1",
        "-vf",
        "scale=320:-1",
        "-q:v",
        "5",
        "-y",
        output_path,
    ]);

    let output = Command::new("ffmpeg")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    Ok(output.status.success())
}

fn encode_image_to_data_uri(path: &str) -> Result<String, String> {
    let image_data = std::fs::read(path).map_err(|e| e.to_string())?;
    let base64_data = STANDARD.encode(&image_data);
    Ok(format!("data:image/jpeg;base64,{}", base64_data))
}

/// Extract video duration in seconds using ffprobe
pub fn get_video_duration(video_path: &Path) -> Result<f64, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            &video_path.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let duration_str = String::from_utf8_lossy(&output.stdout);
    duration_str
        .trim()
        .parse::<f64>()
        .map_err(|e| format!("Failed to parse duration '{}': {}", duration_str.trim(), e))
}

/// Extract video dimensions (width, height) using ffprobe
pub fn get_video_dimensions(video_path: &Path) -> Result<(u32, u32), String> {
    let output = Command::new("ffprobe")
        .args([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=s=x:p=0",
            &video_path.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let dims_str = String::from_utf8_lossy(&output.stdout);
    let dims_str = dims_str.trim();
    let parts: Vec<&str> = dims_str.split('x').collect();

    if parts.len() != 2 {
        return Err(format!("Unexpected dimensions format: '{}'", dims_str));
    }

    let width = parts[0]
        .parse::<u32>()
        .map_err(|e| format!("Failed to parse width '{}': {}", parts[0], e))?;
    let height = parts[1]
        .parse::<u32>()
        .map_err(|e| format!("Failed to parse height '{}': {}", parts[1], e))?;

    Ok((width, height))
}
