import { invoke } from "@tauri-apps/api/core";
import type { ElevenLabsTranscriptResponse } from "../types";

const DATA_TYPE_TRANSCRIPTION = "transcription";

/**
 * Get cached data by CID and data type
 */
export async function getCached<T>(cid: string, dataType: string): Promise<T | null> {
  try {
    const json = await invoke<string | null>("get_cached", { cid, dataType });
    if (json === null) {
      return null;
    }
    return JSON.parse(json) as T;
  } catch (error) {
    console.warn("Cache read failed:", error);
    return null;
  }
}

/**
 * Set cached data by CID and data type
 */
export async function setCached(cid: string, dataType: string, data: unknown): Promise<void> {
  try {
    const json = JSON.stringify(data);
    await invoke("set_cached", { cid, dataType, data: json });
  } catch (error) {
    console.warn("Cache write failed:", error);
  }
}

/**
 * Get cached transcription by CID
 */
export async function getCachedTranscription(cid: string): Promise<ElevenLabsTranscriptResponse | null> {
  return getCached<ElevenLabsTranscriptResponse>(cid, DATA_TYPE_TRANSCRIPTION);
}

/**
 * Set cached transcription by CID
 */
export async function setCachedTranscription(cid: string, data: ElevenLabsTranscriptResponse): Promise<void> {
  return setCached(cid, DATA_TYPE_TRANSCRIPTION, data);
}
