import { fetch } from "@tauri-apps/plugin-http";
import type {
  GeminiFileUploadResponse,
  GeminiFileStatusResponse,
  GeminiGenerateContentResponse,
} from "../types";

const UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

function getApiKey(): string {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) {
    throw new Error("Missing VITE_GEMINI_API_KEY in environment variables");
  }
  return key;
}

export async function uploadVideoFile(file: File): Promise<{ uri: string; mimeType: string }> {
  const apiKey = getApiKey();
  const mimeType = file.type || "video/mp4";
  console.log(`[gemini] uploadVideoFile: name="${file.name}", size=${(file.size / 1024 / 1024).toFixed(1)}MB, mimeType=${mimeType}`);

  // Step 1: Initiate resumable upload
  console.log(`[gemini] Step 1: Initiating resumable upload...`);
  const startResponse = await fetch(`${UPLOAD_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(file.size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: { displayName: file.name },
    }),
  });

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    throw new Error(`Gemini upload init failed (${startResponse.status}): ${errorText}`);
  }

  const uploadUrl = startResponse.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) {
    throw new Error("Gemini upload init did not return an upload URL");
  }
  console.log(`[gemini] Step 1: Upload URL obtained`);

  // Step 2: Upload file bytes
  console.log(`[gemini] Step 2: Uploading ${(file.size / 1024 / 1024).toFixed(1)}MB...`);
  const fileBuffer = await file.arrayBuffer();
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Type": mimeType,
    },
    body: fileBuffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Gemini file upload failed (${uploadResponse.status}): ${errorText}`);
  }

  const uploadResult = (await uploadResponse.json()) as GeminiFileUploadResponse;
  const fileName = uploadResult.file.name;
  console.log(`[gemini] Step 2: Upload complete, fileName=${fileName}`);

  // Step 3: Poll until file is ACTIVE
  console.log(`[gemini] Step 3: Polling for ACTIVE state (timeout: ${POLL_TIMEOUT_MS / 1000}s)...`);
  let pollAttempt = 0;
  const startTime = Date.now();
  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    pollAttempt++;
    // fileName is already prefixed with "files/" (e.g., "files/abc123"),
    // so use the base URL without the /files suffix
    const statusResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`
    );
    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      throw new Error(`Gemini file status check failed (${statusResponse.status}): ${errorText}`);
    }

    const status = (await statusResponse.json()) as GeminiFileStatusResponse;
    console.log(`[gemini] Step 3: Poll #${pollAttempt} → state=${status.state}`);

    if (status.state === "ACTIVE") {
      console.log(`[gemini] Step 3: File is ACTIVE (uri: ${status.uri})`);
      return { uri: status.uri, mimeType };
    }

    if (status.state === "FAILED") {
      const reason = status.error?.message ?? "unknown reason";
      console.error(`[gemini] Step 3: File processing FAILED: ${reason}`, status.error);
      throw new Error(`Gemini file processing failed: ${reason}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Gemini file processing timed out (60s)");
}

export interface SourceDescriptionResult {
  start: number;
  end: number;
  description: string;
}

export async function describeSource(
  fileUri: string,
  mimeType: string,
  durationSeconds: number
): Promise<SourceDescriptionResult[]> {
  const apiKey = getApiKey();
  console.log(`[gemini] describeSource: requesting time-ranged descriptions (duration: ${durationSeconds}s)`);

  const prompt = `Watch this video (${durationSeconds} seconds long) and describe what is visually happening throughout. Break the video into logical segments based on changes in action, subject, or setting. For each segment, provide the start time, end time, and a concise 1-2 sentence description focusing on actions, subjects, and setting.

Rules:
- Times are in seconds
- Segments should cover the entire video without gaps
- Each segment should be a visually distinct moment`;

  const body = {
    contents: [
      {
        parts: [
          { fileData: { mimeType, fileUri } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            start: { type: "NUMBER", description: "Segment start time in seconds" },
            end: { type: "NUMBER", description: "Segment end time in seconds" },
            description: { type: "STRING", description: "Concise 1-2 sentence visual description" },
          },
          required: ["start", "end", "description"],
        },
      },
    },
  };

  const response = await fetch(`${GENERATE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    console.warn(`[gemini] describeSource: Rate limited (429)`);
    throw new RateLimitError("Gemini rate limit exceeded");
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[gemini] describeSource: Failed (${response.status}): ${errorText}`);
    throw new Error(`Gemini generateContent failed (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as GeminiGenerateContentResponse;
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error(`[gemini] describeSource: Empty response. Full result:`, JSON.stringify(result, null, 2));
    throw new Error("Gemini returned empty response");
  }

  console.log(`[gemini] describeSource: Got ${text.length} chars response`);

  const parsed = JSON.parse(text) as SourceDescriptionResult[];
  console.log(`[gemini] describeSource: Parsed ${parsed.length} time-ranged descriptions`);
  return parsed;
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export interface FrameData {
  timestamp: number;
  data: string; // base64-encoded JPEG
}

/**
 * Describe video content using extracted frames (1 per second).
 * Sends frames as images to Gemini for visual understanding.
 */
export async function describeFrames(
  frames: FrameData[],
  durationSeconds: number
): Promise<SourceDescriptionResult[]> {
  const apiKey = getApiKey();
  console.log(`[gemini] describeFrames: analyzing ${frames.length} frames (duration: ${durationSeconds}s)`);

  // Build parts array with all frames as inline images
  const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];

  // Add each frame as an image
  for (const frame of frames) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: frame.data,
      },
    });
  }

  // Build timestamp list for the prompt
  const timestampList = frames.map((f, i) => `Frame ${i + 1}: ${f.timestamp.toFixed(1)}s`).join(", ");

  // Add the prompt
  const prompt = `I've provided ${frames.length} frames extracted from a ${durationSeconds} second video. These frames were extracted at keyframes (scene changes) and to fill gaps, so they're at varying intervals:

${timestampList}

Analyze these frames and describe what is visually happening throughout the video. Break the video into logical segments based on changes in action, subject, or setting. For each segment, provide:
- start: the start time in seconds
- end: the end time in seconds
- description: a concise 1-2 sentence description focusing on actions, subjects, and setting

Rules:
- Use the actual timestamps provided (they are not evenly spaced)
- Segments should cover the entire video from 0 to ${durationSeconds} without gaps
- Each segment should represent a visually distinct moment or scene
- Be specific about what you see in the frames`;

  parts.push({ text: prompt });

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            start: { type: "NUMBER", description: "Segment start time in seconds" },
            end: { type: "NUMBER", description: "Segment end time in seconds" },
            description: { type: "STRING", description: "Concise 1-2 sentence visual description" },
          },
          required: ["start", "end", "description"],
        },
      },
    },
  };

  const response = await fetch(`${GENERATE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    console.warn(`[gemini] describeFrames: Rate limited (429)`);
    throw new RateLimitError("Gemini rate limit exceeded");
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[gemini] describeFrames: Failed (${response.status}): ${errorText}`);
    throw new Error(`Gemini generateContent failed (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as GeminiGenerateContentResponse;
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error(`[gemini] describeFrames: Empty response. Full result:`, JSON.stringify(result, null, 2));
    throw new Error("Gemini returned empty response");
  }

  console.log(`[gemini] describeFrames: Got ${text.length} chars response`);

  const parsed = JSON.parse(text) as SourceDescriptionResult[];
  console.log(`[gemini] describeFrames: Parsed ${parsed.length} time-ranged descriptions`);
  console.log(`[gemini] describeFrames: Descriptions:`);
  for (const desc of parsed) {
    console.log(`  [${desc.start}s - ${desc.end}s] ${desc.description}`);
  }
  return parsed;
}