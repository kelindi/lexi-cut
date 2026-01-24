import { invoke } from "@tauri-apps/api/core";
import type { Source, Segment, SegmentGroup, ProcessingProgress } from "../types";
import { transcribeFile, mapTranscriptToSegments } from "./transcribe";
import { groupSegments } from "./segmentGrouping";
import { describeSegments } from "./describeSegments";
import { requestAssemblyCut } from "./assemblyCut";

/**
 * Ensure all sources have CIDs computed.
 * Returns a map of sourceId → CID for sources that have CIDs.
 * Computes missing CIDs and waits for them.
 */
async function ensureSourceCids(sources: Source[]): Promise<Map<string, string>> {
  const cidMap = new Map<string, string>();

  // Separate sources with and without CIDs
  const withCid = sources.filter((s) => s.cid);
  const withoutCid = sources.filter((s) => !s.cid);

  // Add existing CIDs to map
  for (const source of withCid) {
    cidMap.set(source.id, source.cid!);
  }

  // Compute missing CIDs in parallel
  if (withoutCid.length > 0) {
    console.log(`Computing CIDs for ${withoutCid.length} sources...`);
    const cidPromises = withoutCid.map(async (source) => {
      try {
        const cid = await invoke<string>("generate_cid", { path: source.path });
        return { sourceId: source.id, cid };
      } catch (error) {
        console.warn(`Failed to compute CID for ${source.name}:`, error);
        return { sourceId: source.id, cid: null };
      }
    });

    const results = await Promise.all(cidPromises);
    for (const { sourceId, cid } of results) {
      if (cid) {
        cidMap.set(sourceId, cid);
      }
    }
  }

  return cidMap;
}

export interface PipelineResult {
  segments: Segment[];
  segmentGroups: SegmentGroup[];
  orderedGroupIds: string[];
}

export type ProgressCallback = (progress: ProcessingProgress) => void;

/**
 * Load a file from Tauri filesystem to browser File object
 * Uses a Tauri command to read file bytes since fetch() can't access local files
 */
async function loadFileFromPath(path: string, name: string): Promise<File> {
  // Read file bytes via Tauri command (returns base64)
  const base64Data = await invoke<string>("read_file_base64", { path });

  // Decode base64 to binary
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Determine MIME type from extension
  const ext = name.split(".").pop()?.toLowerCase();
  const mimeType = ext === "mov" ? "video/quicktime" : "video/mp4";

  return new File([bytes], name, { type: mimeType });
}

/**
 * Run the full processing pipeline:
 * 1. Transcribe each source → segments
 * 2. Group segments into SegmentGroups
 * 3. Call assembly cut API → get ordered groups
 */
export async function runPipeline(
  sources: Source[],
  onProgress?: ProgressCallback
): Promise<PipelineResult> {
  console.log(`[pipeline] ===== PIPELINE START (${sources.length} sources) =====`);
  console.log(`[pipeline] Sources:`, sources.map(s => `"${s.name}" (${s.id})`));
  const allSegments: Segment[] = [];
  const allGroups: SegmentGroup[] = [];

  // Pre-phase: Ensure all sources have CIDs for caching
  console.log(`[pipeline] Pre-phase: Computing CIDs...`);
  onProgress?.({
    current: 0,
    total: sources.length,
    message: "Preparing cache keys...",
  });
  const cidMap = await ensureSourceCids(sources);
  console.log(`[pipeline] CIDs computed: ${cidMap.size}/${sources.length} sources have CIDs`);

  // Phase 1: Transcribe each source (with caching)
  console.log(`[pipeline] Phase 1: Transcribing ${sources.length} source(s)...`);
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const cid = cidMap.get(source.id);

    onProgress?.({
      current: i + 1,
      total: sources.length,
      message: `Transcribing ${source.name}...`,
    });

    console.log(`[pipeline] Phase 1: Loading file "${source.name}" from ${source.path}`);
    const file = await loadFileFromPath(source.path, source.name);
    console.log(`[pipeline] Phase 1: File loaded (${(file.size / 1024 / 1024).toFixed(1)} MB), transcribing...`);
    const transcript = await transcribeFile(file, cid);
    let segments = mapTranscriptToSegments(transcript, source.id);
    console.log(`[pipeline] Phase 1: "${source.name}" → ${segments.length} segments (${transcript.words?.length ?? 0} words from ElevenLabs)`);

    // If no speech was detected, create a single video-only segment so Gemini can still describe the clip
    if (segments.length === 0) {
      const fallbackDuration = source.duration ?? 30;
      console.log(`[pipeline] Phase 1: No speech detected, creating video-only segment (0-${fallbackDuration}s)`);
      segments = [{
        id: `seg-${source.id}-0`,
        video: {
          sourceId: source.id,
          start: 0,
          end: fallbackDuration,
        },
      }];
    }

    allSegments.push(...segments);
  }
  console.log(`[pipeline] Phase 1 COMPLETE: ${allSegments.length} total segments`);

  // Phase 2: Group segments by source
  console.log(`[pipeline] Phase 2: Grouping segments...`);
  onProgress?.({
    current: 1,
    total: 2,
    message: "Grouping segments...",
  });

  const segmentsBySource = new Map<string, Segment[]>();
  for (const seg of allSegments) {
    if (!seg.text) continue;
    const sourceId = seg.text.sourceId;
    if (!segmentsBySource.has(sourceId)) {
      segmentsBySource.set(sourceId, []);
    }
    segmentsBySource.get(sourceId)!.push(seg);
  }

  console.log(`[pipeline] Phase 2: ${segmentsBySource.size} source(s) with text segments`);

  let groupOffset = 0;
  for (const [sourceId, segments] of segmentsBySource) {
    const groups = groupSegments(segments, sourceId);
    console.log(`[pipeline] Phase 2: Source ${sourceId} → ${groups.length} groups from ${segments.length} segments`);
    // Offset group IDs to be globally unique
    const prefixedGroups = groups.map((g, idx) => ({
      ...g,
      groupId: `group-${groupOffset + idx}`,
    }));
    allGroups.push(...prefixedGroups);
    groupOffset += groups.length;
  }

  // Create groups for sources with video-only segments (no speech)
  for (const source of sources) {
    const hasGroup = allGroups.some((g) => g.sourceId === source.id);
    if (!hasGroup) {
      const videoSegments = allSegments.filter((s) => s.video?.sourceId === source.id);
      if (videoSegments.length > 0) {
        const seg = videoSegments[0];
        const group: SegmentGroup = {
          groupId: `group-${groupOffset}`,
          sourceId: source.id,
          segmentIds: [seg.id],
          text: "",
          startTime: seg.video!.start,
          endTime: seg.video!.end,
          avgConfidence: 0,
        };
        allGroups.push(group);
        groupOffset++;
        console.log(`[pipeline] Phase 2: Created video-only group for "${source.name}" (${seg.video!.start}s-${seg.video!.end}s)`);
      }
    }
  }

  console.log(`[pipeline] Phase 2 COMPLETE: ${allGroups.length} total groups`);

  // Phase 2.5: Describe groups with Gemini (optional, one call per source)
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (geminiKey) {
    console.log(`[pipeline] Phase 2.5: Describing groups with Gemini for ${sources.length} source(s)`);
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      const sourceGroups = allGroups.filter((g) => g.sourceId === source.id);

      if (sourceGroups.length === 0) {
        console.log(`[pipeline] Phase 2.5: "${source.name}" has no groups, skipping`);
        continue;
      }

      onProgress?.({
        current: i + 1,
        total: sources.length,
        message: `Describing clips from ${source.name}...`,
      });

      console.log(`[pipeline] Phase 2.5: Loading file "${source.name}" for description...`);
      const file = await loadFileFromPath(source.path, source.name);

      const cid = cidMap.get(source.id);
      console.log(`[pipeline] Phase 2.5: Calling describeSegments for ${sourceGroups.length} group(s) (CID: ${cid?.substring(0, 8) ?? "none"})`);
      const result = await describeSegments(file, sourceGroups, cid);
      console.log(`[pipeline] Phase 2.5: Got ${result.descriptions.size} descriptions back`);

      // Update allGroups with enriched groups
      for (const enrichedGroup of result.groups) {
        const idx = allGroups.findIndex((g) => g.groupId === enrichedGroup.groupId);
        if (idx !== -1 && enrichedGroup.description) {
          allGroups[idx] = enrichedGroup;
        }
      }
      console.log(`[pipeline] Phase 2.5: "${source.name}" — ${result.descriptions.size}/${sourceGroups.length} groups described`);
    }
    console.log(`[pipeline] Phase 2.5 COMPLETE`);
  } else {
    console.log("[pipeline] Phase 2.5: SKIPPED (no VITE_GEMINI_API_KEY)");
  }

  // Phase 3: Assembly cut (if multiple groups)
  console.log(`[pipeline] Phase 3: Assembly cut (${allGroups.length} groups, ${sources.length} sources)`);
  let orderedGroupIds: string[];

  if (allGroups.length > 1 && sources.length > 1) {
    console.log(`[pipeline] Phase 3: Multiple sources detected, calling Claude for narrative ordering...`);
    onProgress?.({
      current: 2,
      total: 2,
      message: "Analyzing narrative flow...",
    });

    const sourceNames: Record<string, string> = {};
    for (const source of sources) {
      sourceNames[source.id] = source.name;
    }

    try {
      const result = await requestAssemblyCut({
        segmentGroups: allGroups,
        sourceNames,
      });
      console.log(`[pipeline] Phase 3: Assembly cut returned ${result.orderedSegmentIds.length} ordered IDs`);
      console.log(`[pipeline] Phase 3: Narrative summary: "${result.narrativeSummary?.substring(0, 100)}"`);

      // Use Claude's recommended order, filtering to valid IDs
      const validIds = new Set(allGroups.map((g) => g.groupId));
      orderedGroupIds = result.orderedSegmentIds.filter((id) => validIds.has(id));

      const missingCount = allGroups.length - orderedGroupIds.length;
      if (missingCount > 0) {
        console.warn(`[pipeline] Phase 3: ${missingCount} groups missing from Claude's response, appending at end`);
      }

      // Add any missing groups at the end (in case Claude missed some)
      for (const group of allGroups) {
        if (!orderedGroupIds.includes(group.groupId)) {
          orderedGroupIds.push(group.groupId);
        }
      }
    } catch (error) {
      // If assembly cut fails, just use chronological order
      console.error("[pipeline] Phase 3: Assembly cut FAILED:", error);
      orderedGroupIds = allGroups.map((g) => g.groupId);
    }
  } else {
    console.log(`[pipeline] Phase 3: Single source or <=1 groups, using chronological order`);
    orderedGroupIds = allGroups.map((g) => g.groupId);
  }

  console.log(`[pipeline] ===== PIPELINE COMPLETE =====`);
  console.log(`[pipeline] Result: ${allSegments.length} segments, ${allGroups.length} groups, ${orderedGroupIds.length} ordered IDs`);
  console.log(`[pipeline] Final segments:`, JSON.stringify(allSegments, null, 2));
  console.log(`[pipeline] Final groups:`, JSON.stringify(allGroups, null, 2));
  console.log(`[pipeline] Ordered IDs:`, JSON.stringify(orderedGroupIds));

  return {
    segments: allSegments,
    segmentGroups: allGroups,
    orderedGroupIds,
  };
}
