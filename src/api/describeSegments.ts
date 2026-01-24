import type { Segment, DescriptionProgress, VisualDescription } from "../types";
import { uploadVideoFile, queryVideoTimeRange, RateLimitError } from "./gemini";
import { getCachedDescriptions, setCachedDescriptions } from "./cache";

const DELAY_BETWEEN_QUERIES_MS = 1000;
const MAX_RETRIES = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryWithRetry(
  fileUri: string,
  mimeType: string,
  startTime: number,
  endTime: number,
  spokenText: string
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await queryVideoTimeRange(fileUri, mimeType, startTime, endTime, spokenText);
    } catch (err) {
      if (err instanceof RateLimitError && attempt < MAX_RETRIES - 1) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(`[describeSegments] Rate limited, backing off ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await delay(backoff);
        continue;
      }
      console.warn(
        `[describeSegments] Query failed (attempt ${attempt + 1}/${MAX_RETRIES}):`,
        err instanceof Error ? err.message : err
      );
      if (attempt === MAX_RETRIES - 1) {
        return null;
      }
    }
  }
  return null;
}

export interface DescribeResult {
  segments: Segment[];
  descriptions: Map<string, VisualDescription>;
}

export async function describeSegments(
  file: File,
  segments: Segment[],
  cid?: string,
  onProgress?: (progress: DescriptionProgress) => void
): Promise<DescribeResult> {
  const emptyResult: DescribeResult = {
    segments,
    descriptions: new Map(),
  };

  // Check if API key is configured
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[describeSegments] No VITE_GEMINI_API_KEY configured, skipping descriptions");
    return emptyResult;
  }

  // Filter to segments that have video layers (time ranges for Gemini)
  const describableSegments = segments.filter((s) => s.video);
  console.log(`[describeSegments] ${describableSegments.length}/${segments.length} segments have video layers`);
  if (describableSegments.length === 0) {
    console.warn("[describeSegments] No describable segments found (none have video data)");
    return emptyResult;
  }

  // Check cache first
  if (cid) {
    const cached = await getCachedDescriptions(cid);
    if (cached) {
      console.log(`[describeSegments] Cache hit for CID ${cid.substring(0, 8)}...`);
      const allDescriptions = new Map<string, VisualDescription>(Object.entries(cached));
      const enrichedSegments = segments.map((segment) => {
        const desc = allDescriptions.get(segment.id);
        if (!desc) return segment;
        return { ...segment, description: buildGroupDescription(desc) };
      });
      return { segments: enrichedSegments, descriptions: allDescriptions };
    }
  }

  // Phase 1: Upload video
  console.log(`[describeSegments] Cache miss — uploading video file (${(file.size / 1024 / 1024).toFixed(1)} MB, type: ${file.type})`);
  onProgress?.({ phase: "uploading", current: 0, total: 1 });
  const { uri: fileUri, mimeType } = await uploadVideoFile(file);
  console.log(`[describeSegments] Upload complete — fileUri: ${fileUri}`);

  // Phase 2: Query each segment individually
  onProgress?.({ phase: "processing", current: 0, total: describableSegments.length });

  const allDescriptions = new Map<string, VisualDescription>();
  console.log(`[describeSegments] Querying ${describableSegments.length} segments individually`);

  for (let i = 0; i < describableSegments.length; i++) {
    const seg = describableSegments[i];
    const startTime = seg.video!.start;
    const endTime = seg.video!.end;
    const spokenText = seg.text?.word ?? "";

    onProgress?.({ phase: "describing", current: i + 1, total: describableSegments.length });
    console.log(`[describeSegments] Segment ${i + 1}/${describableSegments.length} (${seg.id}): ${startTime.toFixed(1)}s-${endTime.toFixed(1)}s, text="${spokenText.substring(0, 50)}"`);

    const description = await queryWithRetry(fileUri, mimeType, startTime, endTime, spokenText);

    if (description) {
      const visual: VisualDescription = { summary: description };
      allDescriptions.set(seg.id, visual);
      console.log(`[describeSegments]   ✓ ${seg.id}: "${description.substring(0, 80)}${description.length > 80 ? "..." : ""}"`);
    } else {
      console.warn(`[describeSegments]   ✗ ${seg.id}: no description returned`);
    }

    // Delay between queries to respect rate limits
    if (i < describableSegments.length - 1) {
      await delay(DELAY_BETWEEN_QUERIES_MS);
    }
  }

  // Cache results
  if (cid && allDescriptions.size > 0) {
    const cacheData: Record<string, VisualDescription> = {};
    for (const [id, desc] of allDescriptions) {
      cacheData[id] = desc;
    }
    await setCachedDescriptions(cid, cacheData);
    console.log(`[describeSegments] Cached ${allDescriptions.size} descriptions for CID ${cid.substring(0, 8)}...`);
  }

  // Map descriptions back to segments
  console.log(`[describeSegments] Total descriptions collected: ${allDescriptions.size}/${describableSegments.length}`);
  const enrichedSegments = segments.map((segment) => {
    const desc = allDescriptions.get(segment.id);
    if (!desc) return segment;
    return { ...segment, description: buildGroupDescription(desc) };
  });
  const withDesc = enrichedSegments.filter(s => s.description);
  console.log(`[describeSegments] Enriched ${withDesc.length} segments with descriptions`);

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
