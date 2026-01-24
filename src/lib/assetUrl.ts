import { invoke } from "@tauri-apps/api/core";

/**
 * Get a video URL from the local HTTP server with range request support.
 * This allows proper seeking without loading the entire file into memory.
 */
export async function getVideoUrl(filePath: string): Promise<string> {
  return invoke<string>("get_video_url", { path: filePath });
}
