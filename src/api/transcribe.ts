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
  // Check cache if CID provided
  if (cid) {
    const cached = await getCachedTranscription(cid);
    if (cached) {
      console.log(`Cache hit for CID ${cid.substring(0, 8)}...`);
      return cached;
    }
  }

  // Call ElevenLabs API
  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VITE_ELEVENLABS_API_KEY in environment variables");
  }

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
    throw new Error(`Transcription failed (${response.status}): ${errorText}`);
  }

  const result = await response.json() as ElevenLabsTranscriptResponse;

  // Cache result if CID provided
  if (cid) {
    await setCachedTranscription(cid, result);
    console.log(`Cached transcription for CID ${cid.substring(0, 8)}...`);
  }

  return result;
}

export function mapTranscriptToWords(
  response: ElevenLabsTranscriptResponse,
  sourceId: string
): Word[] {
  return response.words
    .filter((w) => w.type === "word")
    .map((w, index) => ({
      id: `word-${sourceId}-${index}`,
      word: w.text,
      confidence: w.logprob !== undefined ? Math.exp(w.logprob) : 1,
      sourceId,
      start: w.start,
      end: w.end,
    }));
}
