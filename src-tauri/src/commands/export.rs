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
    // Optional separate audio source (for B-roll: video from one source, audio from another)
    #[serde(rename = "audioSourcePath")]
    audio_source_path: Option<String>,
    #[serde(rename = "audioStartTime")]
    audio_start_time: Option<f64>,
    #[serde(rename = "audioEndTime")]
    audio_end_time: Option<f64>,
}

#[derive(Debug, Deserialize, Default)]
pub struct ExportOptions {
    /// "fast" = stream copy (no fades), "standard"/"high" = re-encode with fades
    #[serde(default)]
    pub preset: String,
    /// Fade duration in seconds (default 0.17 = 5 frames at 30fps)
    #[serde(rename = "fadeDuration", default = "default_fade_duration")]
    pub fade_duration: f64,
}

fn default_fade_duration() -> f64 {
    0.167 // ~5 frames at 30fps
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
/// Supports two modes:
/// - "fast" preset: Stream copy (no re-encoding, no fades) - fastest
/// - "standard"/"high" preset: Re-encode with xfade transitions between segments
#[tauri::command]
pub async fn export_video(
    app: AppHandle,
    segments: Vec<ExportSegment>,
    output_path: String,
    options: Option<ExportOptions>,
) -> Result<String, String> {
    if segments.is_empty() {
        return Err("No segments to export".to_string());
    }

    let opts = options.unwrap_or_default();
    let use_fades = opts.preset != "fast" && !opts.preset.is_empty();

    if use_fades {
        export_with_fades(app, segments, output_path, opts).await
    } else {
        export_fast(app, segments, output_path).await
    }
}

/// Fast export using stream copy (no fades, hard cuts)
async fn export_fast(
    app: AppHandle,
    segments: Vec<ExportSegment>,
    output_path: String,
) -> Result<String, String> {
    let total_segments = segments.len();
    let total_duration: f64 = segments.iter().map(|s| s.end_time - s.start_time).sum();

    emit_progress(&app, "preparing", 0, total_segments, None, Some(total_duration), None, Some(0.0));

    let temp_dir = TempDir::new().map_err(|e| format!("Failed to create temp dir: {}", e))?;
    let temp_path = temp_dir.path();

    let mut segment_files: Vec<String> = Vec::new();
    let mut accumulated_duration: f64 = 0.0;

    for (i, segment) in segments.iter().enumerate() {
        let output_file = temp_path.join(format!("segment_{:04}.mp4", i));
        let output_file_str = output_file.to_str().ok_or("Invalid temp path")?.to_string();
        let duration = segment.end_time - segment.start_time;

        emit_progress(&app, "rendering", i + 1, total_segments, Some(accumulated_duration), Some(total_duration), None, Some((accumulated_duration / total_duration) * 100.0));

        // Check if this segment has separate audio (B-roll case)
        let has_separate_audio = segment.audio_source_path.is_some();

        let status = if has_separate_audio {
            // B-roll: extract video from one source, audio from another
            let audio_path = segment.audio_source_path.as_ref().unwrap();
            let audio_start = segment.audio_start_time.unwrap_or(segment.start_time);
            let audio_duration = segment.audio_end_time.map(|e| e - audio_start).unwrap_or(duration);

            Command::new("ffmpeg")
                .args([
                    "-y",
                    "-ss", &format!("{:.3}", segment.start_time),
                    "-i", &segment.source_path,
                    "-ss", &format!("{:.3}", audio_start),
                    "-i", audio_path,
                    "-t", &format!("{:.3}", duration.min(audio_duration)),
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-c", "copy",
                    "-avoid_negative_ts", "make_zero",
                    &output_file_str,
                ])
                .output()
                .map_err(|e| format!("Failed to run ffmpeg: {}", e))?
        } else {
            // Normal: video with its own audio
            Command::new("ffmpeg")
                .args([
                    "-y",
                    "-ss", &format!("{:.3}", segment.start_time),
                    "-i", &segment.source_path,
                    "-t", &format!("{:.3}", duration),
                    "-c", "copy",
                    "-avoid_negative_ts", "make_zero",
                    &output_file_str,
                ])
                .output()
                .map_err(|e| format!("Failed to run ffmpeg: {}", e))?
        };

        if !status.status.success() {
            let stderr = String::from_utf8_lossy(&status.stderr);
            emit_progress(&app, "error", i + 1, total_segments, None, Some(total_duration), None, None);
            return Err(format!("FFmpeg segment extraction failed for segment {}: {}", i, stderr));
        }

        accumulated_duration += duration;
        segment_files.push(output_file_str);
    }

    emit_progress(&app, "finalizing", total_segments, total_segments, Some(total_duration), Some(total_duration), None, Some(95.0));

    // Create concat list file
    let concat_list_path = temp_path.join("concat_list.txt");
    let mut concat_file = File::create(&concat_list_path)
        .map_err(|e| format!("Failed to create concat list: {}", e))?;

    for file in &segment_files {
        writeln!(concat_file, "file '{}'", file)
            .map_err(|e| format!("Failed to write concat list: {}", e))?;
    }
    drop(concat_file);

    let concat_list_str = concat_list_path.to_str().ok_or("Invalid concat list path")?;

    let status = Command::new("ffmpeg")
        .args(["-y", "-f", "concat", "-safe", "0", "-i", concat_list_str, "-c", "copy", &output_path])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg concat: {}", e))?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        emit_progress(&app, "error", total_segments, total_segments, None, Some(total_duration), None, None);
        return Err(format!("FFmpeg concat failed: {}", stderr));
    }

    emit_progress(&app, "complete", total_segments, total_segments, Some(total_duration), Some(total_duration), None, Some(100.0));
    Ok(output_path)
}

/// Export with fade transitions using xfade filter
async fn export_with_fades(
    app: AppHandle,
    segments: Vec<ExportSegment>,
    output_path: String,
    opts: ExportOptions,
) -> Result<String, String> {
    let total_segments = segments.len();
    let fade_duration = opts.fade_duration;

    // Calculate total duration accounting for fade overlaps
    let segment_durations: Vec<f64> = segments.iter().map(|s| s.end_time - s.start_time).collect();
    let total_duration: f64 = segment_durations.iter().sum::<f64>()
        - (fade_duration * (segments.len().saturating_sub(1)) as f64);

    emit_progress(&app, "preparing", 0, total_segments, None, Some(total_duration), None, Some(0.0));

    // For a single segment, just re-encode without filters
    if segments.len() == 1 {
        let segment = &segments[0];
        let duration = segment.end_time - segment.start_time;

        emit_progress(&app, "rendering", 1, 1, Some(0.0), Some(total_duration), None, Some(0.0));

        let has_separate_audio = segment.audio_source_path.is_some();

        let mut args: Vec<String> = vec![
            "-y".to_string(),
            "-progress".to_string(), "pipe:2".to_string(),
            "-ss".to_string(), format!("{:.3}", segment.start_time),
            "-i".to_string(), segment.source_path.clone(),
        ];

        if has_separate_audio {
            let audio_path = segment.audio_source_path.as_ref().unwrap();
            let audio_start = segment.audio_start_time.unwrap_or(segment.start_time);
            args.extend([
                "-ss".to_string(), format!("{:.3}", audio_start),
                "-i".to_string(), audio_path.clone(),
            ]);
        }

        args.extend([
            "-t".to_string(), format!("{:.3}", duration),
        ]);

        if has_separate_audio {
            args.extend(["-map".to_string(), "0:v:0".to_string(), "-map".to_string(), "1:a:0".to_string()]);
        }

        // Encoding settings
        args.extend([
            "-c:v".to_string(), "libx264".to_string(),
            "-preset".to_string(), "medium".to_string(),
            "-crf".to_string(), if opts.preset == "high" { "18".to_string() } else { "23".to_string() },
            "-c:a".to_string(), "aac".to_string(),
            "-b:a".to_string(), "192k".to_string(),
            "-movflags".to_string(), "+faststart".to_string(),
            output_path.clone(),
        ]);

        let mut child = Command::new("ffmpeg")
            .args(&args)
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

        monitor_ffmpeg_progress(&app, &mut child, 1, 1, total_duration).await;

        let status = child.wait().map_err(|e| format!("FFmpeg wait failed: {}", e))?;
        if !status.success() {
            emit_progress(&app, "error", 1, 1, None, Some(total_duration), None, None);
            return Err("FFmpeg encoding failed".to_string());
        }

        emit_progress(&app, "complete", 1, 1, Some(total_duration), Some(total_duration), None, Some(100.0));
        return Ok(output_path);
    }

    // Multiple segments: use xfade filter
    let temp_dir = TempDir::new().map_err(|e| format!("Failed to create temp dir: {}", e))?;
    let temp_path = temp_dir.path();

    // Step 1: Extract and re-encode each segment to consistent format
    emit_progress(&app, "rendering", 0, total_segments, Some(0.0), Some(total_duration), None, Some(0.0));

    let mut segment_files: Vec<String> = Vec::new();
    let mut accumulated_duration: f64 = 0.0;

    for (i, segment) in segments.iter().enumerate() {
        let output_file = temp_path.join(format!("segment_{:04}.mp4", i));
        let output_file_str = output_file.to_str().ok_or("Invalid temp path")?.to_string();
        let duration = segment.end_time - segment.start_time;

        emit_progress(&app, "rendering", i + 1, total_segments, Some(accumulated_duration), Some(total_duration), None,
            Some((accumulated_duration / total_duration) * 50.0)); // First 50% for segment extraction

        let has_separate_audio = segment.audio_source_path.is_some();

        let mut args: Vec<String> = vec![
            "-y".to_string(),
            "-ss".to_string(), format!("{:.3}", segment.start_time),
            "-i".to_string(), segment.source_path.clone(),
        ];

        if has_separate_audio {
            let audio_path = segment.audio_source_path.as_ref().unwrap();
            let audio_start = segment.audio_start_time.unwrap_or(segment.start_time);
            args.extend([
                "-ss".to_string(), format!("{:.3}", audio_start),
                "-i".to_string(), audio_path.clone(),
            ]);
        }

        args.extend(["-t".to_string(), format!("{:.3}", duration)]);

        if has_separate_audio {
            args.extend(["-map".to_string(), "0:v:0".to_string(), "-map".to_string(), "1:a:0".to_string()]);
        }

        // Re-encode to consistent format for xfade compatibility
        args.extend([
            "-c:v".to_string(), "libx264".to_string(),
            "-preset".to_string(), "fast".to_string(),
            "-crf".to_string(), "18".to_string(), // High quality intermediate
            "-c:a".to_string(), "aac".to_string(),
            "-b:a".to_string(), "192k".to_string(),
            "-r".to_string(), "30".to_string(), // Consistent frame rate
            output_file_str.clone(),
        ]);

        let status = Command::new("ffmpeg")
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

        if !status.status.success() {
            let stderr = String::from_utf8_lossy(&status.stderr);
            emit_progress(&app, "error", i + 1, total_segments, None, Some(total_duration), None, None);
            return Err(format!("FFmpeg segment encoding failed for segment {}: {}", i, stderr));
        }

        accumulated_duration += duration;
        segment_files.push(output_file_str);
    }

    // Step 2: Build and run xfade filter
    emit_progress(&app, "finalizing", total_segments, total_segments, Some(total_duration), Some(total_duration), None, Some(50.0));

    // Build input arguments
    let mut args: Vec<String> = vec!["-y".to_string(), "-progress".to_string(), "pipe:2".to_string()];
    for file in &segment_files {
        args.extend(["-i".to_string(), file.clone()]);
    }

    // Build xfade filter for video
    let n = segment_files.len();

    // Calculate offsets for each transition
    let mut offset = segment_durations[0] - fade_duration;

    let (video_filter, audio_filter) = if n == 2 {
        // Simple case: just one xfade
        let vf = format!(
            "[0:v][1:v]xfade=transition=fade:duration={:.3}:offset={:.3}[vout]",
            fade_duration, offset
        );
        let af = format!(
            "[0:a][1:a]acrossfade=d={:.3}:c1=tri:c2=tri[aout]",
            fade_duration
        );
        (vf, af)
    } else {
        // Chain xfades: [0][1]xfade[v01]; [v01][2]xfade[v012]; ...
        let mut vf = format!(
            "[0:v][1:v]xfade=transition=fade:duration={:.3}:offset={:.3}[v01]",
            fade_duration, offset
        );
        let mut af = format!(
            "[0:a][1:a]acrossfade=d={:.3}:c1=tri:c2=tri[a01]",
            fade_duration
        );

        for i in 2..n {
            offset += segment_durations[i - 1] - fade_duration;
            let prev_v = if i == 2 { "v01".to_string() } else { format!("v{:02}", i - 1) };
            let next_v = if i == n - 1 { "vout".to_string() } else { format!("v{:02}", i) };
            let prev_a = if i == 2 { "a01".to_string() } else { format!("a{:02}", i - 1) };
            let next_a = if i == n - 1 { "aout".to_string() } else { format!("a{:02}", i) };

            vf.push_str(&format!(
                ";[{}][{}:v]xfade=transition=fade:duration={:.3}:offset={:.3}[{}]",
                prev_v, i, fade_duration, offset, next_v
            ));
            af.push_str(&format!(
                ";[{}][{}:a]acrossfade=d={:.3}:c1=tri:c2=tri[{}]",
                prev_a, i, fade_duration, next_a
            ));
        }
        (vf, af)
    };

    let filter_complex = format!("{};{}", video_filter, audio_filter);

    args.extend([
        "-filter_complex".to_string(), filter_complex,
        "-map".to_string(), "[vout]".to_string(),
        "-map".to_string(), "[aout]".to_string(),
        "-c:v".to_string(), "libx264".to_string(),
        "-preset".to_string(), "medium".to_string(),
        "-crf".to_string(), if opts.preset == "high" { "18".to_string() } else { "23".to_string() },
        "-c:a".to_string(), "aac".to_string(),
        "-b:a".to_string(), "192k".to_string(),
        "-movflags".to_string(), "+faststart".to_string(),
        output_path.clone(),
    ]);

    let mut child = Command::new("ffmpeg")
        .args(&args)
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run ffmpeg xfade: {}", e))?;

    // Monitor progress during final encode (50-100%)
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                if let Some((time, fps)) = parse_ffmpeg_progress(&line) {
                    let percent = 50.0 + (time / total_duration) * 50.0;
                    emit_progress(&app, "finalizing", total_segments, total_segments,
                        Some(time), Some(total_duration), fps, Some(percent.min(99.0)));
                }
            }
        }
    }

    let status = child.wait().map_err(|e| format!("FFmpeg wait failed: {}", e))?;

    if !status.success() {
        emit_progress(&app, "error", total_segments, total_segments, None, Some(total_duration), None, None);
        return Err("FFmpeg xfade failed".to_string());
    }

    emit_progress(&app, "complete", total_segments, total_segments, Some(total_duration), Some(total_duration), None, Some(100.0));
    Ok(output_path)
}

/// Helper to emit progress events
fn emit_progress(
    app: &AppHandle,
    phase: &str,
    current_segment: usize,
    total_segments: usize,
    current_time: Option<f64>,
    total_time: Option<f64>,
    fps: Option<f64>,
    percent: Option<f64>,
) {
    let _ = app.emit(
        "export-progress",
        ExportProgressEvent {
            phase: phase.to_string(),
            current_segment,
            total_segments,
            current_time,
            total_time,
            fps,
            percent,
        },
    );
}

/// Monitor FFmpeg stderr for progress updates
async fn monitor_ffmpeg_progress(
    app: &AppHandle,
    child: &mut std::process::Child,
    current_segment: usize,
    total_segments: usize,
    total_duration: f64,
) {
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                if let Some((time, fps)) = parse_ffmpeg_progress(&line) {
                    let percent = (time / total_duration) * 100.0;
                    emit_progress(app, "rendering", current_segment, total_segments,
                        Some(time), Some(total_duration), fps, Some(percent.min(99.0)));
                }
            }
        }
    }
}
