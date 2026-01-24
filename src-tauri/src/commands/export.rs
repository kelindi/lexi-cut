use serde::Deserialize;
use std::fs::File;
use std::io::Write;
use std::process::Command;
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

/// Export video by concatenating segments using ffmpeg
///
/// This command:
/// 1. Creates a temporary directory for intermediate files
/// 2. Extracts each segment using ffmpeg with -ss (start) and -t (duration)
/// 3. Creates a concat list file
/// 4. Concatenates all segments into the output file
#[tauri::command]
pub async fn export_video(
    segments: Vec<ExportSegment>,
    output_path: String,
) -> Result<String, String> {
    if segments.is_empty() {
        return Err("No segments to export".to_string());
    }

    // Create temp directory for intermediate files
    let temp_dir = TempDir::new().map_err(|e| format!("Failed to create temp dir: {}", e))?;
    let temp_path = temp_dir.path();

    let mut segment_files: Vec<String> = Vec::new();

    // Extract each segment
    for (i, segment) in segments.iter().enumerate() {
        let output_file = temp_path.join(format!("segment_{:04}.mp4", i));
        let output_file_str = output_file
            .to_str()
            .ok_or("Invalid temp path")?
            .to_string();

        let duration = segment.end_time - segment.start_time;

        // Use ffmpeg to extract segment
        // -ss before -i for fast seeking
        // -t for duration
        // -c copy for fast extraction (no re-encoding)
        // -avoid_negative_ts make_zero for proper timestamps
        let status = Command::new("ffmpeg")
            .args([
                "-y",
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
            .output()
            .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

        if !status.status.success() {
            let stderr = String::from_utf8_lossy(&status.stderr);
            return Err(format!(
                "FFmpeg segment extraction failed for segment {}: {}",
                i, stderr
            ));
        }

        segment_files.push(output_file_str);
    }

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
        return Err(format!("FFmpeg concat failed: {}", stderr));
    }

    Ok(output_path)
}
