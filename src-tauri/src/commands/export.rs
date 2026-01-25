use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};
use tempfile::TempDir;

#[derive(Debug, Deserialize)]
pub struct ExportSegment {
    #[serde(rename = "sourcePath")]
    source_path: String,
    #[serde(rename = "startTime")]
    start_time: f64,
    #[serde(rename = "endTime")]
    end_time: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportProgressEvent {
    pub phase: String,
    #[serde(rename = "currentSegment")]
    pub current_segment: usize,
    #[serde(rename = "totalSegments")]
    pub total_segments: usize,
    #[serde(rename = "currentTime")]
    pub current_time: Option<f64>,
    #[serde(rename = "totalTime")]
    pub total_time: Option<f64>,
    pub fps: Option<f64>,
    pub percent: Option<f64>,
}

fn parse_ffmpeg_progress(line: &str) -> Option<(f64, Option<f64>)> {
    // FFmpeg progress output looks like:
    // frame=  120 fps=60 q=28.0 size=1024kB time=00:00:04.00 bitrate=2097.2kbits/s speed=2.0x
    if !line.contains("time=") {
        return None;
    }

    let mut time_secs = None;
    let mut fps = None;

    // Parse time
    if let Some(time_start) = line.find("time=") {
        let time_str = &line[time_start + 5..];
        if let Some(end) = time_str.find(' ') {
            let time_part = &time_str[..end];
            // Parse HH:MM:SS.ms format
            let parts: Vec<&str> = time_part.split(':').collect();
            if parts.len() == 3 {
                let hours: f64 = parts[0].parse().unwrap_or(0.0);
                let mins: f64 = parts[1].parse().unwrap_or(0.0);
                let secs: f64 = parts[2].parse().unwrap_or(0.0);
                time_secs = Some(hours * 3600.0 + mins * 60.0 + secs);
            }
        }
    }

    // Parse fps
    if let Some(fps_start) = line.find("fps=") {
        let fps_str = &line[fps_start + 4..];
        if let Some(end) = fps_str.find(' ') {
            fps = fps_str[..end].trim().parse().ok();
        }
    }

    time_secs.map(|t| (t, fps))
}

/// Export video by concatenating segments using ffmpeg
///
/// This command:
/// 1. Creates a temporary directory for intermediate files
/// 2. Extracts each segment using ffmpeg with -ss (start) and -t (duration)
/// 3. Creates a concat list file
/// 4. Concatenates all segments into the output file
#[tauri::command]
pub async fn export_video(
    app: AppHandle,
    segments: Vec<ExportSegment>,
    output_path: String,
) -> Result<String, String> {
    if segments.is_empty() {
        return Err("No segments to export".to_string());
    }

    let total_segments = segments.len();

    // Calculate total duration for progress
    let total_duration: f64 = segments.iter().map(|s| s.end_time - s.start_time).sum();

    // Emit preparing phase
    let _ = app.emit(
        "export-progress",
        ExportProgressEvent {
            phase: "preparing".to_string(),
            current_segment: 0,
            total_segments,
            current_time: None,
            total_time: Some(total_duration),
            fps: None,
            percent: Some(0.0),
        },
    );

    // Create temp directory for intermediate files
    let temp_dir = TempDir::new().map_err(|e| format!("Failed to create temp dir: {}", e))?;
    let temp_path = temp_dir.path();

    let mut segment_files: Vec<String> = Vec::new();
    let mut accumulated_duration: f64 = 0.0;

    // Extract each segment
    for (i, segment) in segments.iter().enumerate() {
        let output_file = temp_path.join(format!("segment_{:04}.mp4", i));
        let output_file_str = output_file
            .to_str()
            .ok_or("Invalid temp path")?
            .to_string();

        let duration = segment.end_time - segment.start_time;

        // Emit segment start
        let _ = app.emit(
            "export-progress",
            ExportProgressEvent {
                phase: "rendering".to_string(),
                current_segment: i + 1,
                total_segments,
                current_time: Some(accumulated_duration),
                total_time: Some(total_duration),
                fps: None,
                percent: Some((accumulated_duration / total_duration) * 100.0),
            },
        );

        // Use ffmpeg to extract segment with progress output
        let mut child = Command::new("ffmpeg")
            .args([
                "-y",
                "-progress", "pipe:2",
                "-ss",
                &format!("{:.3}", segment.start_time),
                "-i",
                &segment.source_path,
                "-t",
                &format!("{:.3}", duration),
                "-c",
                "copy",
                "-avoid_negative_ts",
                "make_zero",
                &output_file_str,
            ])
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

        // Read stderr for progress
        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    if let Some((time, fps)) = parse_ffmpeg_progress(&line) {
                        let current_total = accumulated_duration + time;
                        let _ = app.emit(
                            "export-progress",
                            ExportProgressEvent {
                                phase: "rendering".to_string(),
                                current_segment: i + 1,
                                total_segments,
                                current_time: Some(current_total),
                                total_time: Some(total_duration),
                                fps,
                                percent: Some((current_total / total_duration) * 100.0),
                            },
                        );
                    }
                }
            }
        }

        let status = child.wait().map_err(|e| format!("FFmpeg wait failed: {}", e))?;

        if !status.success() {
            let _ = app.emit(
                "export-progress",
                ExportProgressEvent {
                    phase: "error".to_string(),
                    current_segment: i + 1,
                    total_segments,
                    current_time: None,
                    total_time: Some(total_duration),
                    fps: None,
                    percent: None,
                },
            );
            return Err(format!("FFmpeg segment extraction failed for segment {}", i));
        }

        accumulated_duration += duration;
        segment_files.push(output_file_str);
    }

    // Emit finalizing phase
    let _ = app.emit(
        "export-progress",
        ExportProgressEvent {
            phase: "finalizing".to_string(),
            current_segment: total_segments,
            total_segments,
            current_time: Some(total_duration),
            total_time: Some(total_duration),
            fps: None,
            percent: Some(95.0),
        },
    );

    // Create concat list file
    let concat_list_path = temp_path.join("concat_list.txt");
    let mut concat_file = File::create(&concat_list_path)
        .map_err(|e| format!("Failed to create concat list: {}", e))?;

    for file in &segment_files {
        writeln!(concat_file, "file '{}'", file)
            .map_err(|e| format!("Failed to write concat list: {}", e))?;
    }

    drop(concat_file);

    // Concatenate all segments
    let concat_list_str = concat_list_path
        .to_str()
        .ok_or("Invalid concat list path")?;

    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            concat_list_str,
            "-c",
            "copy",
            &output_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg concat: {}", e))?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        let _ = app.emit(
            "export-progress",
            ExportProgressEvent {
                phase: "error".to_string(),
                current_segment: total_segments,
                total_segments,
                current_time: None,
                total_time: Some(total_duration),
                fps: None,
                percent: None,
            },
        );
        return Err(format!("FFmpeg concat failed: {}", stderr));
    }

    // Emit complete
    let _ = app.emit(
        "export-progress",
        ExportProgressEvent {
            phase: "complete".to_string(),
            current_segment: total_segments,
            total_segments,
            current_time: Some(total_duration),
            total_time: Some(total_duration),
            fps: None,
            percent: Some(100.0),
        },
    );

    Ok(output_path)
}
