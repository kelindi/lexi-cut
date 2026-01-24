import type { Segment, DescriptionProgress } from "../types";
import { groupSegments } from "./segmentGrouping";
import { uploadVideoFile, queryVideoTimeRange, RateLimitError } from "./gemini";

const DELAY_BETWEEN_QUERIES_MS = 500;
const MAX_RETRIES = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryWithRetry(
  fileUri: string,
  mimeType: string,
  startTime: number,
  endTime: number,
  text: string
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await queryVideoTimeRange(fileUri, mimeType, startTime, endTime, text);
    } catch (err) {
      if (err instanceof RateLimitError && attempt < MAX_RETRIES - 1) {
        const backoff = Math.pow(2, attempt) * 1000;
        await delay(backoff);
        continue;
      }
      // Non-rate-limit errors or final retry: skip this group
      console.warn(
        `Gemini query failed for ${startTime.toFixed(1)}s-${endTime.toFixed(1)}s:`,
        err instanceof Error ? err.message : err
      );
      return null;
    }
  }
  return null;
}

export async function describeSegments(
  file: File,
  segments: Segment[],
  onProgress?: (progress: DescriptionProgress) => void
): Promise<Segment[]> {
  // Check if API key is configured
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return segments;
  }

  // Determine sourceId from the first segment with a text layer
  const firstTextSegment = segments.find((s) => s.text);
  if (!firstTextSegment?.text) {
    return segments;
  }
  const sourceId = firstTextSegment.text.sourceId;

  // Phase 1: Upload video
  onProgress?.({ phase: "uploading", current: 0, total: 1 });
  const { uri: fileUri, mimeType } = await uploadVideoFile(file);

  // Phase 2: Group segments
  onProgress?.({ phase: "processing", current: 0, total: 1 });
  const groups = groupSegments(segments, sourceId);

  // Phase 3: Query each group
  const descriptionMap = new Map<string, string>();

  for (let i = 0; i < groups.length; i++) {
    onProgress?.({ phase: "querying", current: i + 1, total: groups.length });

    const group = groups[i];
    const description = await queryWithRetry(
      fileUri,
      mimeType,
      group.startTime,
      group.endTime,
      group.text
    );

    if (description) {
      for (const segId of group.segmentIds) {
        descriptionMap.set(segId, description);
      }
    }

    // Delay between queries to respect rate limits
    if (i < groups.length - 1) {
      await delay(DELAY_BETWEEN_QUERIES_MS);
    }
  }

  // Assign descriptions to segments (immutable update)
  return segments.map((segment) => {
    const description = descriptionMap.get(segment.id);
    if (description) {
      return { ...segment, description };
    }
    return segment;
  });
}