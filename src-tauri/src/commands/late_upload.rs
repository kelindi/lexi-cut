use serde::{Deserialize, Serialize};
use std::fs;
use std::process::Command;

// Max file size before compression (500MB - Late supports up to 5GB via presigned URLs)
const MAX_FILE_SIZE: u64 = 500 * 1024 * 1024; // 500MB

#[derive(Debug, Serialize, Deserialize)]
pub struct MediaUploadResult {
    pub url: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    pub size: u64,
}

#[derive(Debug, Deserialize)]
struct PresignResponse {
    #[serde(rename = "uploadUrl")]
    upload_url: String,
    #[serde(rename = "publicUrl")]
    public_url: String,
}

#[derive(Debug, Deserialize)]
struct LateErrorResponse {
    message: Option<String>,
    error: Option<String>,
}

/// Compress video using FFmpeg if it exceeds size limit
fn compress_video_if_needed(file_path: &str) -> Result<String, String> {
    let metadata = fs::metadata(file_path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;

    let file_size = metadata.len();

    if file_size <= MAX_FILE_SIZE {
        // File is small enough, no compression needed
        return Ok(file_path.to_string());
    }

    // Calculate target bitrate to achieve ~35MB output (conservative to stay under 50MB limit)
    // Get video duration first
    let duration_output = Command::new("ffprobe")
        .args([
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    let duration_str = String::from_utf8_lossy(&duration_output.stdout);
    let duration: f64 = duration_str.trim().parse().unwrap_or(60.0);

    // Target ~35MB with 0.8 safety factor (FFmpeg often overshoots)
    // 35MB * 0.8 = 28MB effective target
    // 28MB = 28 * 1024 * 8 kbits, divide by duration in seconds
    let target_size_mb = 28.0;
    let target_bitrate = ((target_size_mb * 1024.0 * 8.0) / duration) as u32;
    let audio_bitrate = 96; // 96kbps for audio (saves space)
    let video_bitrate = target_bitrate.saturating_sub(audio_bitrate).max(500);

    // Create compressed output path
    let compressed_path = file_path.replace(".mp4", "_compressed.mp4");

    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", file_path,
            "-c:v", "libx264",
            "-preset", "fast",
            "-b:v", &format!("{}k", video_bitrate),
            "-maxrate", &format!("{}k", video_bitrate * 2),
            "-bufsize", &format!("{}k", video_bitrate * 4),
            "-c:a", "aac",
            "-b:a", &format!("{}k", audio_bitrate),
            "-movflags", "+faststart",
            &compressed_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg compression: {}", e))?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        return Err(format!("FFmpeg compression failed: {}", stderr));
    }

    Ok(compressed_path)
}

/// Upload a video file to Late API using presigned URLs
/// This avoids the serverless function payload limit by uploading directly to storage
#[tauri::command]
pub async fn upload_to_late(file_path: String, api_key: String) -> Result<MediaUploadResult, String> {
    // Compress video if needed (run in blocking task since it's CPU-intensive)
    let path_for_compress = file_path.clone();
    let upload_path = tokio::task::spawn_blocking(move || {
        compress_video_if_needed(&path_for_compress)
    })
    .await
    .map_err(|e| format!("Compression task failed: {}", e))??;

    // Read the file
    let file_bytes = fs::read(&upload_path)
        .map_err(|e| format!("Failed to read file '{}': {}", upload_path, e))?;

    let file_size = file_bytes.len() as u64;

    let file_name = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("video.mp4")
        .to_string();

    let client = reqwest::Client::new();

    // Step 1: Get presigned URL from Late API
    let presign_body = serde_json::json!({
        "filename": file_name,
        "contentType": "video/mp4"
    });

    let presign_response = client
        .post("https://getlate.dev/api/v1/media/presign")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .body(presign_body.to_string())
        .send()
        .await
        .map_err(|e| format!("Failed to get presigned URL: {}", e))?;

    let presign_status = presign_response.status();
    let presign_body_text = presign_response
        .text()
        .await
        .map_err(|e| format!("Failed to read presign response: {}", e))?;

    if !presign_status.is_success() {
        if let Ok(parsed) = serde_json::from_str::<LateErrorResponse>(&presign_body_text) {
            if let Some(msg) = parsed.message.or(parsed.error) {
                return Err(msg);
            }
        }
        return Err(format!("Failed to get presigned URL ({}): {}", presign_status, presign_body_text));
    }

    let presign_data: PresignResponse = serde_json::from_str(&presign_body_text)
        .map_err(|e| format!("Failed to parse presign response: {} - Body: {}", e, presign_body_text))?;

    // Step 2: Upload file directly to storage using presigned URL
    let upload_response = client
        .put(&presign_data.upload_url)
        .header("Content-Type", "video/mp4")
        .body(file_bytes)
        .send()
        .await
        .map_err(|e| format!("Failed to upload to storage: {}", e))?;

    let upload_status = upload_response.status();
    if !upload_status.is_success() {
        let error_body = upload_response.text().await.unwrap_or_default();
        return Err(format!("Storage upload failed ({}): {}", upload_status, error_body));
    }

    // Return the public URL that can be used in posts
    Ok(MediaUploadResult {
        url: presign_data.public_url,
        mime_type: "video/mp4".to_string(),
        size: file_size,
    })
}
