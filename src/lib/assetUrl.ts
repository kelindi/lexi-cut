import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Get a video URL using Tauri's asset protocol.
 */
export function getVideoUrl(filePath: string): string {
  return convertFileSrc(filePath);
}
