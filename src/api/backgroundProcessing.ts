import { invoke } from "@tauri-apps/api/core";
import { getCachedTranscription, getCachedDescriptions } from "./cache";
import { transcribeFile } from "./transcribe";
import { describeSourceWithFrames } from "./describeSegments";

// Track in-flight requests by CID
const inFlightTranscriptions = new Map<string, Promise<void>>();
const inFlightDescriptions = new Map<string, Promise<void>>();

/**
 * Load a file from Tauri filesystem to browser File object
 */
async function loadVideoAsFile(path: string): Promise<File> {
  const name = path.split("/").pop() || path;
  const base64Data = await invoke<string>("read_file_base64", { path });

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const ext = name.split(".").pop()?.toLowerCase();
  const mimeType = ext === "mov" ? "video/quicktime" : "video/mp4";

  return new File([bytes], name, { type: mimeType });
}

/**
 * Start transcription in the background for a source.
 * Returns immediately - the work continues in the background.
 * Uses in-flight tracking to prevent duplicate requests.
 */
export async function transcribeSourceBackground(
  sourcePath: string,
  cid: string
): Promise<void> {
  // Check cache first
  if (await getCachedTranscription(cid)) {
    console.log(`[background] Transcription cache hit: ${cid.slice(0, 8)}...`);
    return;
  }

  // Check if already in-flight, wait for it
  const existing = inFlightTranscriptions.get(cid);
  if (existing) {
    console.log(`[background] Transcription already in-flight: ${cid.slice(0, 8)}...`);
    return existing;
  }

  // Start processing and track
  console.log(`[background] Starting transcription: ${cid.slice(0, 8)}...`);
  const promise = (async () => {
    try {
      const file = await loadVideoAsFile(sourcePath);
      await transcribeFile(file, cid);
      console.log(`[background] Transcription complete: ${cid.slice(0, 8)}...`);
    } catch (e) {
      console.warn(`[background] Transcription failed: ${cid.slice(0, 8)}...`, e);
    } finally {
      inFlightTranscriptions.delete(cid);
    }
  })();

  inFlightTranscriptions.set(cid, promise);
  return promise;
}

/**
 * Start description generation in the background for a source.
 * Returns immediately - the work continues in the background.
 * Uses in-flight tracking to prevent duplicate requests.
 */
export async function describeSourceBackground(
  sourcePath: string,
  duration: number | undefined,
  cid: string
): Promise<void> {
  // Check cache first
  if (await getCachedDescriptions(cid)) {
    console.log(`[background] Descriptions cache hit: ${cid.slice(0, 8)}...`);
    return;
  }

  // Check if already in-flight
  const existing = inFlightDescriptions.get(cid);
  if (existing) {
    console.log(`[background] Descriptions already in-flight: ${cid.slice(0, 8)}...`);
    return existing;
  }

  // Start processing and track
  console.log(`[background] Starting descriptions: ${cid.slice(0, 8)}...`);
  const promise = (async () => {
    try {
      await describeSourceWithFrames(sourcePath, duration ?? 30, cid);
      console.log(`[background] Descriptions complete: ${cid.slice(0, 8)}...`);
    } catch (e) {
      console.warn(`[background] Descriptions failed: ${cid.slice(0, 8)}...`, e);
    } finally {
      inFlightDescriptions.delete(cid);
    }
  })();

  inFlightDescriptions.set(cid, promise);
  return promise;
}

/**
 * Wait for any in-flight processing for a given CID.
 * Call this before processing to ensure background work is done.
 */
export async function waitForInFlight(cid: string): Promise<void> {
  const transcription = inFlightTranscriptions.get(cid);
  const descriptions = inFlightDescriptions.get(cid);

  if (transcription || descriptions) {
    console.log(`[background] Waiting for in-flight processing: ${cid.slice(0, 8)}...`);
    await Promise.all([transcription, descriptions].filter(Boolean));
  }
}
