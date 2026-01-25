import { invoke } from "@tauri-apps/api/core";
import type { SourceDescription, DescriptionProgress } from "../types";
import { describeFrames, FrameData, RateLimitError } from "./gemini";
import { getCachedDescriptions, setCachedDescriptions } from "./cache";

const MAX_RETRIES = 3;
const MAX_FRAMES = 60; // Limit frames sent to Gemini (hybrid extraction is smart about selection)

interface ExtractedFrame {
  timestamp: number;
  data: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Describe a source video using frame extraction and Gemini image recognition.
 * Extracts 1 frame per second, sends to Gemini for visual analysis.
 * Returns the descriptions array, or null if it fails.
 */
export async function describeSourceWithFrames(
  sourcePath: string,
  durationSeconds: number,
  cid?: string,
  onProgress?: (progress: DescriptionProgress) => void
): Promise<SourceDescription[] | null> {
  // Check if API key is configured
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[describeSource] No VITE_GEMINI_API_KEY configured, skipping description");
    return null;
  }

  console.log(`[describeSource] Describing source with frames: "${sourcePath}" (${durationSeconds}s)`);

  // Check cache first
  if (cid) {
    const cached = await getCachedDescriptions(cid);
    if (cached) {
      console.log(`[describeSource] Cache hit for CID ${cid.substring(0, 8)}... (${cached.length} descriptions)`);
      return cached;
    }
  }

  // Extract frames at 1fps
  console.log(`[describeSource] Cache miss — extracting frames at 1fps...`);
  onProgress?.({ phase: "uploading", current: 0, total: 1 });

  const extractedFrames = await invoke<ExtractedFrame[]>("extract_frames_base64", {
    path: sourcePath,
    maxFrames: MAX_FRAMES,
  });

  console.log(`[describeSource] Extracted ${extractedFrames.length} frames`);

  // Convert to FrameData format
  const frames: FrameData[] = extractedFrames.map((f) => ({
    timestamp: f.timestamp,
    data: f.data,
  }));

  // Call Gemini with frames
  onProgress?.({ phase: "describing", current: 1, total: 1 });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const descriptions = await describeFrames(frames, durationSeconds);
      console.log(`[describeSource] Got ${descriptions.length} time-ranged descriptions from frames`);

      // Cache result
      if (cid) {
        await setCachedDescriptions(cid, descriptions);
        console.log(`[describeSource] Cached ${descriptions.length} descriptions for CID ${cid.substring(0, 8)}...`);
      }

      return descriptions;
    } catch (err) {
      if (err instanceof RateLimitError && attempt < MAX_RETRIES - 1) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(`[describeSource] Rate limited, backing off ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await delay(backoff);
        continue;
      }
      console.error(`[describeSource] Query failed (attempt ${attempt + 1}/${MAX_RETRIES}):`, err instanceof Error ? err.message : err);
      if (attempt === MAX_RETRIES - 1) {
        return null;
      }
    }
  }

  return null;
}
