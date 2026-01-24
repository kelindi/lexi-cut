use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use std::{collections::HashMap, io::SeekFrom, sync::Arc};
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncSeekExt},
    sync::RwLock,
};

/// Shared state for the video server
#[derive(Clone)]
pub struct VideoServerState {
    /// Map of video IDs to file paths
    pub videos: Arc<RwLock<HashMap<String, String>>>,
}

impl VideoServerState {
    pub fn new() -> Self {
        Self {
            videos: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

/// Parse Range header: "bytes=start-end" or "bytes=start-"
fn parse_range(range_header: &str, file_size: u64) -> Option<(u64, u64)> {
    let range = range_header.strip_prefix("bytes=")?;
    let parts: Vec<&str> = range.split('-').collect();

    if parts.len() != 2 {
        return None;
    }

    let start: u64 = parts[0].parse().ok()?;
    let end: u64 = if parts[1].is_empty() {
        file_size - 1
    } else {
        parts[1].parse().ok()?
    };

    if start <= end && end < file_size {
        Some((start, end))
    } else {
        None
    }
}

/// Get MIME type from file extension
fn get_mime_type(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        _ => "application/octet-stream",
    }
}

/// Handle video requests with range support
async fn serve_video(
    State(state): State<VideoServerState>,
    Path(video_id): Path<String>,
    headers: HeaderMap,
) -> Response {
    println!("[video_server] Request for video_id: {}", video_id);

    // Get the file path for this video ID
    let path = {
        let videos = state.videos.read().await;
        println!("[video_server] Registered videos: {:?}", videos.keys().collect::<Vec<_>>());
        match videos.get(&video_id) {
            Some(p) => p.clone(),
            None => {
                println!("[video_server] Video not found: {}", video_id);
                return (StatusCode::NOT_FOUND, "Video not found").into_response();
            }
        }
    };

    println!("[video_server] Serving file: {}", path);

    // Open the file
    let mut file = match File::open(&path).await {
        Ok(f) => f,
        Err(e) => {
            eprintln!("Failed to open video file {}: {}", path, e);
            return (StatusCode::NOT_FOUND, "File not found").into_response();
        }
    };

    // Get file size
    let metadata = match file.metadata().await {
        Ok(m) => m,
        Err(e) => {
            eprintln!("Failed to get file metadata: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file").into_response();
        }
    };
    let file_size = metadata.len();
    let mime_type = get_mime_type(&path);

    // Check for Range header
    let range_header = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok());

    if let Some(range_str) = range_header {
        // Partial content response
        if let Some((start, end)) = parse_range(range_str, file_size) {
            let length = end - start + 1;

            // Seek to start position
            if file.seek(SeekFrom::Start(start)).await.is_err() {
                return (StatusCode::INTERNAL_SERVER_ERROR, "Seek failed").into_response();
            }

            // Read the requested range
            let mut buffer = vec![0u8; length as usize];
            if file.read_exact(&mut buffer).await.is_err() {
                return (StatusCode::INTERNAL_SERVER_ERROR, "Read failed").into_response();
            }

            return Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_TYPE, mime_type)
                .header(header::CONTENT_LENGTH, length.to_string())
                .header(header::ACCEPT_RANGES, "bytes")
                .header(
                    header::CONTENT_RANGE,
                    format!("bytes {}-{}/{}", start, end, file_size),
                )
                .body(Body::from(buffer))
                .unwrap();
        }
    }

    // Full file response
    let mut buffer = Vec::with_capacity(file_size as usize);
    if file.read_to_end(&mut buffer).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Read failed").into_response();
    }

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime_type)
        .header(header::CONTENT_LENGTH, file_size.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .body(Body::from(buffer))
        .unwrap()
}

/// Start the video server on a random available port
pub async fn start_video_server(state: VideoServerState) -> u16 {
    let app = Router::new()
        .route("/video/:id", get(serve_video))
        .with_state(state);

    // Bind to localhost with port 0 (random available port)
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("Failed to bind video server");

    let port = listener.local_addr().unwrap().port();
    println!("Video server started on port {}", port);

    // Spawn the server
    tokio::spawn(async move {
        axum::serve(listener, app).await.ok();
    });

    port
}
