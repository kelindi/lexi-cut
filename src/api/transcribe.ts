import type { ElevenLabsTranscriptResponse, Segment } from "../types";

const API_URL = "https://api.elevenlabs.io/v1/speech-to-text";

export async function transcribeFile(file: File): Promise<ElevenLabsTranscriptResponse> {
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

  return response.json() as Promise<ElevenLabsTranscriptResponse>;
}

export function mapTranscriptToSegments(
  response: ElevenLabsTranscriptResponse,
  sourceId: string
): Segment[] {
  return response.words
    .filter((w) => w.type === "word")
    .map((word, index) => ({
      id: `seg-${sourceId}-${index}`,
      text: {
        word: word.text,
        confidence: word.logprob !== undefined ? Math.exp(word.logprob) : 1,
        sourceId,
        start: word.start,
        end: word.end,
      },
    }));
}
