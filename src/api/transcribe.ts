import { fetch } from "@tauri-apps/plugin-http";
import type { ElevenLabsTranscriptResponse, Word } from "../types";
import { getCachedTranscription, setCachedTranscription } from "./cache";

const API_URL = "https://api.elevenlabs.io/v1/speech-to-text";

/**
 * Transcribe a file with optional CID-based caching.
 * If a CID is provided and a cached result exists, returns the cached result.
 * Otherwise calls the ElevenLabs API and caches the result.
 */
export async function transcribeFile(file: File, cid?: string): Promise<ElevenLabsTranscriptResponse> {
  console.log(`[transcribe] transcribeFile: "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)}MB), CID=${cid?.substring(0, 8) ?? "none"}`);

  // Check cache if CID provided
  if (cid) {
    const cached = await getCachedTranscription(cid);
    if (cached) {
      console.log(`[transcribe] Cache HIT for CID ${cid.substring(0, 8)}... (${cached.words?.length ?? 0} words)`);
      return cached;
    }
    console.log(`[transcribe] Cache MISS for CID ${cid.substring(0, 8)}...`);
  }

  // Call ElevenLabs API
  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VITE_ELEVENLABS_API_KEY in environment variables");
  }

  console.log(`[transcribe] Calling ElevenLabs API (model: scribe_v2)...`);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model_id", "scribe_v2");
  formData.append("timestamps_granularity", "word");
  formData.append("tag_audio_events", "false");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[transcribe] ElevenLabs API FAILED (${response.status}): ${errorText}`);
    throw new Error(`Transcription failed (${response.status}): ${errorText}`);
  }

  const result = await response.json() as ElevenLabsTranscriptResponse;
  console.log(`[transcribe] ElevenLabs returned ${result.words?.length ?? 0} words, text length=${result.text?.length ?? 0}`);

  // Cache result if CID provided
  if (cid) {
    await setCachedTranscription(cid, result);
    console.log(`[transcribe] Cached transcription for CID ${cid.substring(0, 8)}...`);
  }

  return result;
}

export function mapTranscriptToWords(
  response: ElevenLabsTranscriptResponse,
  sourceId: string
): Word[] {
  // Handle videos with no audio (words might be null/undefined/empty)
  if (!response.words || response.words.length === 0) {
    return [];
  }

  return response.words
    .filter((w) => w.type === "word")
    .map((word, index) => ({
      id: `word-${sourceId}-${index}`,
      word: word.text,
      confidence: word.logprob !== undefined ? Math.exp(word.logprob) : 1,
      sourceId,
      start: word.start,
      end: word.end,
    }));
}
