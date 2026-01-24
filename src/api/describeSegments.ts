import type { SegmentGroup, DescriptionProgress } from "../types";
import { uploadVideoFile, queryVideoOverview, RateLimitError } from "./gemini";
import { getCachedDescriptions, setCachedDescriptions } from "./cache";

const MAX_RETRIES = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DescribeResult {
  groups: SegmentGroup[];
  descriptions: Map<string, string>;
}

/**
 * Describe segment groups using a single Gemini call per source.
 * Uploads the video once, asks Gemini to describe all groups in one request,
 * then maps descriptions back to groups by groupId.
 */
export async function describeSegments(
  file: File,
  groups: SegmentGroup[],
  cid?: string,
  onProgress?: (progress: DescriptionProgress) => void
): Promise<DescribeResult> {
  const emptyResult: DescribeResult = {
    groups,
    descriptions: new Map(),
  };

  // Check if API key is configured
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[describeSegments] No VITE_GEMINI_API_KEY configured, skipping descriptions");
    return emptyResult;
  }

  if (groups.length === 0) {
    console.warn("[describeSegments] No groups to describe");
    return emptyResult;
  }

  console.log(`[describeSegments] ${groups.length} group(s) to describe`);

  // Check cache first
  if (cid) {
    const cached = await getCachedDescriptions(cid);
    if (cached) {
      console.log(`[describeSegments] Cache hit for CID ${cid.substring(0, 8)}...`);
      const descriptions = new Map<string, string>();
      const enrichedGroups = groups.map((group) => {
        const desc = cached[group.groupId];
        if (desc) {
          descriptions.set(group.groupId, desc.summary);
          return { ...group, description: desc.summary };
        }
        return group;
      });
      return { groups: enrichedGroups, descriptions };
    }
  }

  // Upload video
  console.log(`[describeSegments] Cache miss — uploading video file (${(file.size / 1024 / 1024).toFixed(1)} MB, type: ${file.type})`);
  onProgress?.({ phase: "uploading", current: 0, total: 1 });
  const { uri: fileUri, mimeType } = await uploadVideoFile(file);
  console.log(`[describeSegments] Upload complete — fileUri: ${fileUri}`);

  // Single Gemini call with retry
  onProgress?.({ phase: "describing", current: 1, total: 1 });

  const groupInputs = groups.map((g) => ({
    groupId: g.groupId,
    startTime: g.startTime,
    endTime: g.endTime,
    text: g.text,
  }));

  let descriptions = new Map<string, string>();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const results = await queryVideoOverview(fileUri, mimeType, groupInputs);
      for (const r of results) {
        descriptions.set(r.groupId, r.description);
      }
      console.log(`[describeSegments] Got ${descriptions.size}/${groups.length} descriptions from Gemini`);
      break;
    } catch (err) {
      if (err instanceof RateLimitError && attempt < MAX_RETRIES - 1) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(`[describeSegments] Rate limited, backing off ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await delay(backoff);
        continue;
      }
      console.error(`[describeSegments] Query failed (attempt ${attempt + 1}/${MAX_RETRIES}):`, err instanceof Error ? err.message : err);
      if (attempt === MAX_RETRIES - 1) {
        return emptyResult;
      }
    }
  }

  // Cache results
  if (cid && descriptions.size > 0) {
    const cacheData: Record<string, { summary: string }> = {};
    for (const [id, desc] of descriptions) {
      cacheData[id] = { summary: desc };
    }
    await setCachedDescriptions(cid, cacheData);
    console.log(`[describeSegments] Cached ${descriptions.size} descriptions for CID ${cid.substring(0, 8)}...`);
  }

  // Map descriptions back to groups
  const enrichedGroups = groups.map((group) => {
    const desc = descriptions.get(group.groupId);
    if (!desc) return group;
    return { ...group, description: desc };
  });
  console.log(`[describeSegments] Enriched ${descriptions.size}/${groups.length} groups with descriptions`);

  return {
    groups: enrichedGroups,
    descriptions,
  };
}
