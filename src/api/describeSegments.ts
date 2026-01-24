import type { SourceDescription, DescriptionProgress } from "../types";
import { uploadVideoFile, describeSource, RateLimitError } from "./gemini";
import { getCachedDescriptions, setCachedDescriptions } from "./cache";

const MAX_RETRIES = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Describe a source video file using Gemini.
 * Uploads the video once, asks Gemini for time-ranged descriptions.
 * Returns the descriptions array, or null if it fails.
 */
export async function describeSourceFile(
  file: File,
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

  console.log(`[describeSource] Describing source file "${file.name}" (${durationSeconds}s)`);

  // Check cache first
  if (cid) {
    const cached = await getCachedDescriptions(cid);
    if (cached) {
      console.log(`[describeSource] Cache hit for CID ${cid.substring(0, 8)}... (${cached.length} descriptions)`);
      return cached;
    }
  }

  // Upload video
  console.log(`[describeSource] Cache miss — uploading video file (${(file.size / 1024 / 1024).toFixed(1)} MB, type: ${file.type})`);
  onProgress?.({ phase: "uploading", current: 0, total: 1 });
  const { uri: fileUri, mimeType } = await uploadVideoFile(file);
  console.log(`[describeSource] Upload complete — fileUri: ${fileUri}`);

  // Gemini call with retry
  onProgress?.({ phase: "describing", current: 1, total: 1 });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const descriptions = await describeSource(fileUri, mimeType, durationSeconds);
      console.log(`[describeSource] Got ${descriptions.length} time-ranged descriptions`);

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
