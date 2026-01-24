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
      console.error(`[gemini] Step 3: File processing FAILED`);
      throw new Error("Gemini file processing failed");
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Gemini file processing timed out (60s)");
}

export async function queryVideoTimeRange(
  fileUri: string,
  mimeType: string,
  startTime: number,
  endTime: number,
  spokenText: string
): Promise<string> {
  const apiKey = getApiKey();
  console.log(`[gemini] queryVideoTimeRange: ${startTime.toFixed(1)}s-${endTime.toFixed(1)}s, text="${spokenText.substring(0, 40)}"`);

  const prompt = `Analyze the video from ${startTime.toFixed(1)}s to ${endTime.toFixed(1)}s.
The spoken words during this time are: "${spokenText}"

Provide a concise description (1-2 sentences) of what is happening in the video during this timeframe, combining visual and audio context. Focus on actions, subjects, and setting that would help a video editor understand the content of this clip.`;

  const body = {
    contents: [
      {
        parts: [
          { fileData: { mimeType, fileUri } },
          { text: prompt },
        ],
      },
    ],
  };

  const response = await fetch(`${GENERATE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    console.warn(`[gemini] queryVideoTimeRange: Rate limited (429)`);
    throw new RateLimitError("Gemini rate limit exceeded");
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[gemini] queryVideoTimeRange: Failed (${response.status}): ${errorText}`);
    throw new Error(`Gemini generateContent failed (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as GeminiGenerateContentResponse;
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error(`[gemini] queryVideoTimeRange: Empty response. Full result:`, JSON.stringify(result, null, 2));
    throw new Error("Gemini returned empty response");
  }

  console.log(`[gemini] queryVideoTimeRange: Got ${text.length} chars response`);
  return text.trim();
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}