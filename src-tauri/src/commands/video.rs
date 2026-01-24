use crate::services::VideoServerState;
use sha2::{Digest, Sha256};
use tauri::State;

/// Register a video file and return its URL
#[tauri::command]
pub async fn get_video_url(
    path: String,
    video_state: State<'_, VideoServerState>,
    port: State<'_, VideoServerPort>,
) -> Result<String, String> {
    // Create a unique ID from the file path
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    let hash = hex::encode(hasher.finalize());
    let video_id = &hash[..16]; // Use first 16 chars

    println!("[get_video_url] Registering video: {} -> {}", video_id, path);

    // Register the video
    {
        let mut videos = video_state.videos.write().await;
        videos.insert(video_id.to_string(), path.clone());
    }

    let url = format!("http://127.0.0.1:{}/video/{}", port.0, video_id);
    println!("[get_video_url] Returning URL: {}", url);

    Ok(url)
}

/// Wrapper type to hold the server port
pub struct VideoServerPort(pub u16);
