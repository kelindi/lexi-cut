import { invoke } from "@tauri-apps/api/core";
import type { Source, Word, SegmentGroup, Sentence, SourceDescription, ProcessingProgress } from "../types";
import { transcribeFile, mapTranscriptToWords } from "./transcribe";
import { groupWords } from "./segmentGrouping";
import { describeSourceWithFrames } from "./describeSegments";
import { requestAssemblyCut, groupWordsForAssembly } from "./assemblyCut";
import { waitForInFlight } from "./backgroundProcessing";

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
  words: Word[];
  segmentGroups: SegmentGroup[];
  orderedGroupIds: string[];
  sentences: Sentence[];
  transcriptlessSourceIds: string[];
}

export type ProgressCallback = (progress: ProcessingProgress) => void;
export type DescriptionCallback = (sourceId: string, descriptions: SourceDescription[]) => void;

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
  onProgress?: ProgressCallback,
  onDescriptions?: DescriptionCallback
): Promise<PipelineResult> {
  console.log(`[pipeline] ===== PIPELINE START (${sources.length} sources) =====`);
  console.log(`[pipeline] Sources:`, sources.map(s => `"${s.name}" (${s.id})`));
  const allWords: Word[] = [];
  const allGroups: SegmentGroup[] = [];
  const sourcesWithNoSpeech: { sourceId: string; duration: number }[] = [];

  // Pre-phase: Ensure all sources have CIDs for caching
  console.log(`[pipeline] Pre-phase: Computing CIDs...`);
  onProgress?.({
    current: 0,
    total: sources.length,
    message: "Preparing cache keys...",
  });
  const cidMap = await ensureSourceCids(sources);
  console.log(`[pipeline] CIDs computed: ${cidMap.size}/${sources.length} sources have CIDs`);

  // Wait for any in-flight background processing before starting pipeline
  console.log(`[pipeline] Waiting for any in-flight background processing...`);
  for (const source of sources) {
    const cid = cidMap.get(source.id) || source.cid;
    if (cid) {
      await waitForInFlight(cid);
    }
  }
  console.log(`[pipeline] Background processing sync complete`);

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
    const words = mapTranscriptToWords(transcript, source.id);
    console.log(`[pipeline] Phase 1: "${source.name}" → ${words.length} words from ElevenLabs`);

    // Track sources with no speech for video-only group creation later
    if (words.length === 0) {
      const fallbackDuration = source.duration ?? 30;
      console.log(`[pipeline] Phase 1: No speech detected, will create video-only group (0-${fallbackDuration}s)`);
      sourcesWithNoSpeech.push({ sourceId: source.id, duration: fallbackDuration });
    }

    allWords.push(...words);
  }
  console.log(`[pipeline] Phase 1 COMPLETE: ${allWords.length} total words`);

  // Phase 2: Group words by source
  console.log(`[pipeline] Phase 2: Grouping words...`);
  onProgress?.({
    current: 1,
    total: 2,
    message: "Grouping words...",
  });

  const wordsBySource = new Map<string, Word[]>();
  for (const word of allWords) {
    if (!wordsBySource.has(word.sourceId)) {
      wordsBySource.set(word.sourceId, []);
    }
    wordsBySource.get(word.sourceId)!.push(word);
  }

  console.log(`[pipeline] Phase 2: ${wordsBySource.size} source(s) with words`);

  let groupOffset = 0;
  for (const [sourceId, words] of wordsBySource) {
    const groups = groupWords(words, sourceId);
    console.log(`[pipeline] Phase 2: Source ${sourceId} → ${groups.length} groups from ${words.length} words`);
    // Offset group IDs to be globally unique
    const prefixedGroups = groups.map((g, idx) => ({
      ...g,
      groupId: `group-${groupOffset + idx}`,
    }));
    allGroups.push(...prefixedGroups);
    groupOffset += groups.length;
  }

  // Create groups for sources with no speech (video-only)
  for (const { sourceId, duration } of sourcesWithNoSpeech) {
    const source = sources.find((s) => s.id === sourceId);
    const group: SegmentGroup = {
      groupId: `group-${groupOffset}`,
      sourceId,
      segmentIds: [],
      text: "",
      startTime: 0,
      endTime: duration,
      avgConfidence: 0,
    };
    allGroups.push(group);
    groupOffset++;
    console.log(`[pipeline] Phase 2: Created video-only group for "${source?.name}" (0s-${duration}s)`);
  }

  console.log(`[pipeline] Phase 2 COMPLETE: ${allGroups.length} total groups`);

  // Phase 2.5: Describe sources with Gemini (optional, parallel processing)
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (geminiKey) {
    console.log(`[pipeline] Phase 2.5: Describing ${sources.length} source(s) with Gemini (parallel)`);
    onProgress?.({
      current: 1,
      total: sources.length,
      message: `Describing ${sources.length} sources...`,
    });

    const descriptionPromises = sources.map(async (source) => {
      const duration = source.duration ?? 30;
      const cid = cidMap.get(source.id);

      try {
        console.log(`[pipeline] Phase 2.5: Extracting frames from "${source.name}" for Gemini (CID: ${cid?.substring(0, 8) ?? "none"}, duration: ${duration}s)`);
        const descriptions = await describeSourceWithFrames(source.path, duration, cid);

        if (descriptions && descriptions.length > 0) {
          source.descriptions = descriptions;
          onDescriptions?.(source.id, descriptions);
          console.log(`[pipeline] Phase 2.5: "${source.name}" — ${descriptions.length} time-ranged descriptions`);
          console.log(`[pipeline] Phase 2.5: "${source.name}" descriptions:`, JSON.stringify(descriptions, null, 2));
        } else {
          console.log(`[pipeline] Phase 2.5: "${source.name}" — no descriptions returned`);
        }
      } catch (err) {
        console.warn(`[pipeline] Phase 2.5: Failed to describe "${source.name}", skipping...`);
        console.warn(`[pipeline] Phase 2.5: Error:`, err instanceof Error ? err.message : err);
        // Continue with other sources - descriptions are optional
      }
    });

    await Promise.all(descriptionPromises);
    console.log(`[pipeline] Phase 2.5 COMPLETE`);
    console.log(`[pipeline] Phase 2.5 SUMMARY:`);
    for (const source of sources) {
      const count = source.descriptions?.length ?? 0;
      console.log(`[pipeline]   "${source.name}" (${source.id}): ${count} descriptions`);
      if (source.descriptions) {
        for (const d of source.descriptions) {
          console.log(`[pipeline]     [${d.start.toFixed(1)}s - ${d.end.toFixed(1)}s] ${d.description}`);
        }
      }
    }
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

  // Generate sentences by splitting words on sentence boundaries
  const sentenceGroups = groupWordsForAssembly(allWords);
  const sentences: Sentence[] = sentenceGroups.map((g, idx) => ({
    sentenceId: `sentence-${idx}`,
    sourceId: g.sourceId,
    wordIds: g.segmentIds, // segmentIds are actually word IDs
    text: g.text,
    startTime: g.startTime,
    endTime: g.endTime,
    originalGroupId: g.groupId,
  }));

  // Create sentences for transcriptless sources (videos with no audio)
  // These have no words but still need to be in the timeline
  let transcriptlessSentenceIdx = sentences.length;
  for (const { sourceId, duration } of sourcesWithNoSpeech) {
    const source = sources.find((s) => s.id === sourceId);
    const transcriptlessSentence: Sentence = {
      sentenceId: `sentence-${transcriptlessSentenceIdx++}`,
      sourceId,
      wordIds: [], // No words for transcriptless sources
      text: source?.name ?? "Video",
      startTime: 0,
      endTime: duration,
    };
    sentences.push(transcriptlessSentence);
    console.log(`[pipeline] Created sentence for transcriptless source "${source?.name}" (0s-${duration}s)`);
  }

  const transcriptlessSourceIds = sourcesWithNoSpeech.map((s) => s.sourceId);

  console.log(`[pipeline] ===== PIPELINE COMPLETE =====`);
  console.log(`[pipeline] Result: ${allWords.length} words, ${allGroups.length} groups, ${sentences.length} sentences, ${orderedGroupIds.length} ordered IDs`);
  console.log(`[pipeline] Final words:`, JSON.stringify(allWords, null, 2));
  console.log(`[pipeline] Final groups:`, JSON.stringify(allGroups, null, 2));
  console.log(`[pipeline] Ordered IDs:`, JSON.stringify(orderedGroupIds));

  return {
    words: allWords,
    segmentGroups: allGroups,
    orderedGroupIds,
    sentences,
    transcriptlessSourceIds,
  };
}
