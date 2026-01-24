import type { Segment, DescriptionProgress, VisualDescription } from "../types";
import { uploadVideoFile, queryVideoBatch, RateLimitError } from "./gemini";
import type { BatchSegment } from "./gemini";

const BATCH_SIZE = 5;
const DELAY_BETWEEN_BATCHES_MS = 1000;
const MAX_RETRIES = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function queryBatchWithRetry(
  fileUri: string,
  mimeType: string,
  segments: BatchSegment[]
): Promise<Record<string, { summary: string; person?: string; activity?: string; setting?: string }>> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await queryVideoBatch(fileUri, mimeType, segments);
    } catch (err) {
      if (err instanceof RateLimitError && attempt < MAX_RETRIES - 1) {
        const backoff = Math.pow(2, attempt) * 1000;
        await delay(backoff);
        continue;
      }
      console.warn(
        `Gemini batch query failed (attempt ${attempt + 1}/${MAX_RETRIES}):`,
        err instanceof Error ? err.message : err
      );
      if (attempt === MAX_RETRIES - 1) {
        return {};
      }
    }
  }
  return {};
}

export interface DescribeResult {
  segments: Segment[];
  descriptions: Map<string, VisualDescription>;
}

export async function describeSegments(
  file: File,
  segments: Segment[],
  onProgress?: (progress: DescriptionProgress) => void
): Promise<DescribeResult> {
  const emptyResult: DescribeResult = {
    segments,
    descriptions: new Map(),
  };

  // Check if API key is configured
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return emptyResult;
  }

  // Filter to segments that have video layers (time ranges for Gemini)
  const describableSegments = segments.filter((s) => s.video);
  if (describableSegments.length === 0) {
    return emptyResult;
  }

  // Phase 1: Upload video
  onProgress?.({ phase: "uploading", current: 0, total: 1 });
  const { uri: fileUri, mimeType } = await uploadVideoFile(file);

  // Phase 2: Batch query descriptions
  onProgress?.({ phase: "processing", current: 0, total: 1 });

  const allDescriptions = new Map<string, VisualDescription>();
  const batches = chunkArray(describableSegments, BATCH_SIZE);

  for (let i = 0; i < batches.length; i++) {
    onProgress?.({ phase: "describing", current: i + 1, total: batches.length });

    const batch = batches[i];
    const batchInput: BatchSegment[] = batch.map((s) => ({
      segmentId: s.id,
      startTime: s.video!.start,
      endTime: s.video!.end,
      text: s.text?.word ?? "",
    }));

    const result = await queryBatchWithRetry(fileUri, mimeType, batchInput);

    for (const [segmentId, desc] of Object.entries(result)) {
      allDescriptions.set(segmentId, {
        summary: desc.summary,
        person: desc.person,
        activity: desc.activity,
        setting: desc.setting,
      });
    }

    // Delay between batches to respect rate limits
    if (i < batches.length - 1) {
      await delay(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  // Map descriptions back to segments
  const enrichedSegments = segments.map((segment) => {
    const desc = allDescriptions.get(segment.id);
    if (!desc) return segment;
    return { ...segment, description: buildGroupDescription(desc) };
  });

  return {
    segments: enrichedSegments,
    descriptions: allDescriptions,
  };
}

/**
 * Build a combined description string from a VisualDescription.
 * Used to populate Segment.description and derive SegmentGroup.description.
 */
export function buildGroupDescription(desc: VisualDescription): string {
  return [desc.summary, desc.person, desc.activity, desc.setting]
    .filter(Boolean)
    .join(" | ");
}
