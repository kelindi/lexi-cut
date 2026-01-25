use base64::{engine::general_purpose::STANDARD, Engine};
use std::fs;
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

/// Gap fill settings
const MAX_GAP_SECONDS: f64 = 5.0; // Fill gaps larger than 5 seconds
const MIN_FRAME_DISTANCE: f64 = 1.0; // Don't place frames closer than 1 second
const DEFAULT_MAX_FRAMES: u32 = 60; // Reasonable limit for Gemini

/// Extract frames using hybrid approach:
/// 1. Extract all I-frames (keyframes) - natural scene boundaries
/// 2. Fill gaps > 5 seconds with additional frames
/// 3. Dedupe frames that are too close together
///
/// Returns an array of base64-encoded JPEG frames with timestamps.
#[tauri::command]
pub async fn extract_frames_base64(
    path: String,
    max_frames: Option<u32>,
) -> Result<Vec<ExtractedFrame>, String> {
    let max = max_frames.unwrap_or(DEFAULT_MAX_FRAMES);

    // First, get video duration
    let duration = get_video_duration(&path)?;
    println!(
        "[extract_frames] Video duration: {:.1}s, max frames: {}",
        duration, max
    );

    // Create temp directory for frames
    let temp_dir =
        TempDir::new().map_err(|e| format!("Failed to create temp directory: {}", e))?;
    let temp_path = temp_dir.path();

    // Step 1: Extract I-frames with timestamps
    println!("[extract_frames] Step 1: Extracting I-frames (keyframes)...");
    let keyframe_timestamps = extract_keyframe_timestamps(&path)?;
    println!(
        "[extract_frames] Found {} I-frames at: {:?}",
        keyframe_timestamps.len(),
        keyframe_timestamps
            .iter()
            .map(|t| format!("{:.1}s", t))
            .collect::<Vec<_>>()
    );

    // Step 2: Calculate which timestamps we need (I-frames + gap fills)
    let mut target_timestamps = calculate_target_timestamps(&keyframe_timestamps, duration);
    println!(
        "[extract_frames] Step 2: Target timestamps (with gap fills): {} frames",
        target_timestamps.len()
    );

    // Step 3: Limit to max frames (prioritize even distribution)
    if target_timestamps.len() > max as usize {
        target_timestamps = subsample_timestamps(&target_timestamps, max as usize);
        println!(
            "[extract_frames] Step 3: Subsampled to {} frames",
            target_timestamps.len()
        );
    }

    // Step 4: Extract frames at specific timestamps
    println!(
        "[extract_frames] Step 4: Extracting {} frames at specific timestamps...",
        target_timestamps.len()
    );
    let frames = extract_frames_at_timestamps(&path, &target_timestamps, temp_path)?;

    println!("[extract_frames] Done! Extracted {} frames", frames.len());
    Ok(frames)
}

/// Get video duration in seconds using ffprobe
fn get_video_duration(path: &str) -> Result<f64, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {}", stderr));
    }

    let duration_str = String::from_utf8_lossy(&output.stdout);
    duration_str
        .trim()
        .parse::<f64>()
        .map_err(|e| format!("Failed to parse duration '{}': {}", duration_str.trim(), e))
}

/// Extract timestamps of all I-frames using ffprobe
fn extract_keyframe_timestamps(path: &str) -> Result<Vec<f64>, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "frame=pts_time,pict_type",
            "-of",
            "csv=print_section=0",
            path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe for keyframes: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe keyframe extraction failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut timestamps: Vec<f64> = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() >= 2 {
            let pict_type = parts[1].trim();
            if pict_type == "I" {
                if let Ok(ts) = parts[0].trim().parse::<f64>() {
                    timestamps.push(ts);
                }
            }
        }
    }

    // Ensure we always have timestamp 0
    if timestamps.is_empty() || timestamps[0] > 0.5 {
        timestamps.insert(0, 0.0);
    }

    Ok(timestamps)
}

/// Calculate target timestamps: I-frames + gap fills
fn calculate_target_timestamps(keyframe_timestamps: &[f64], duration: f64) -> Vec<f64> {
    let mut targets: Vec<f64> = Vec::new();

    // Always start at 0
    if keyframe_timestamps.is_empty() || keyframe_timestamps[0] > MIN_FRAME_DISTANCE {
        targets.push(0.0);
    }

    let mut prev_ts = 0.0;

    for &kf_ts in keyframe_timestamps {
        // Fill gap between previous timestamp and this keyframe
        if kf_ts - prev_ts > MAX_GAP_SECONDS {
            let gap_start = prev_ts + MIN_FRAME_DISTANCE;
            let mut fill_ts = gap_start;
            while fill_ts < kf_ts - MIN_FRAME_DISTANCE {
                targets.push(fill_ts);
                fill_ts += 1.0; // 1fps fill rate
            }
        }

        // Add the keyframe itself (if not too close to previous)
        if targets.is_empty() || kf_ts - targets.last().unwrap() >= MIN_FRAME_DISTANCE {
            targets.push(kf_ts);
        }

        prev_ts = kf_ts;
    }

    // Fill gap from last keyframe to end of video
    if duration - prev_ts > MAX_GAP_SECONDS {
        let mut fill_ts = prev_ts + MIN_FRAME_DISTANCE;
        while fill_ts < duration - MIN_FRAME_DISTANCE {
            targets.push(fill_ts);
            fill_ts += 1.0;
        }
    }

    // Add final frame near end if there's a gap
    if duration - prev_ts > MIN_FRAME_DISTANCE * 2.0 {
        let final_ts = (duration - 0.5).max(prev_ts + MIN_FRAME_DISTANCE);
        if targets.is_empty() || final_ts - targets.last().unwrap() >= MIN_FRAME_DISTANCE {
            targets.push(final_ts);
        }
    }

    targets.sort_by(|a, b| a.partial_cmp(b).unwrap());
    targets
}

/// Subsample timestamps to fit within max, preserving even distribution
fn subsample_timestamps(timestamps: &[f64], max: usize) -> Vec<f64> {
    if timestamps.len() <= max {
        return timestamps.to_vec();
    }

    let mut result: Vec<f64> = Vec::with_capacity(max);

    // Always include first and last
    result.push(timestamps[0]);

    if max == 1 {
        return result;
    }

    // Evenly distribute remaining slots
    let step = (timestamps.len() - 1) as f64 / (max - 1) as f64;
    for i in 1..max - 1 {
        let idx = (i as f64 * step).round() as usize;
        result.push(timestamps[idx.min(timestamps.len() - 1)]);
    }

    result.push(*timestamps.last().unwrap());
    result
}

/// Extract frames at specific timestamps
fn extract_frames_at_timestamps(
    path: &str,
    timestamps: &[f64],
    temp_path: &std::path::Path,
) -> Result<Vec<ExtractedFrame>, String> {
    let mut frames: Vec<ExtractedFrame> = Vec::new();

    for (idx, &ts) in timestamps.iter().enumerate() {
        let output_path = temp_path.join(format!("frame_{:04}.jpg", idx));

        // Use ffmpeg to extract a single frame at the specific timestamp
        let output = Command::new("ffmpeg")
            .args([
                "-y",
                "-ss",
                &format!("{:.3}", ts),
                "-i",
                path,
                "-vframes",
                "1",
                "-q:v",
                "2",
                output_path.to_str().unwrap(),
            ])
            .output()
            .map_err(|e| format!("Failed to extract frame at {:.1}s: {}", ts, e))?;

        if !output.status.success() {
            // Skip frames that fail (might be at very end)
            println!(
                "[extract_frames] Warning: Failed to extract frame at {:.1}s, skipping",
                ts
            );
            continue;
        }

        if output_path.exists() {
            let bytes = fs::read(&output_path)
                .map_err(|e| format!("Failed to read frame at {:.1}s: {}", ts, e))?;

            frames.push(ExtractedFrame {
                timestamp: ts,
                data: STANDARD.encode(&bytes),
            });
        }
    }

    Ok(frames)
}
