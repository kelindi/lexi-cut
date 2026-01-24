import { invoke } from "@tauri-apps/api/core";
import type { Source, Word, SegmentGroup, Sentence, ProcessingProgress } from "../types";
import { transcribeFile, mapTranscriptToWords } from "./transcribe";
import { groupWords } from "./segmentGrouping";
import { requestAssemblyCut } from "./assemblyCut";
import { extractSentences } from "../utils/sentenceExtractor";

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
  orderedSentenceIds: string[];
  transcriptlessSourceIds: string[];
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
  const allWords: Word[] = [];
  const allGroups: SegmentGroup[] = [];
  const transcriptlessSourceIds: string[] = [];

  // Pre-phase: Ensure all sources have CIDs for caching
  onProgress?.({
    current: 0,
    total: sources.length,
    message: "Preparing cache keys...",
  });
  const cidMap = await ensureSourceCids(sources);

  // Phase 1: Transcribe each source (with caching)
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const cid = cidMap.get(source.id);

    onProgress?.({
      current: i + 1,
      total: sources.length,
      message: `Transcribing ${source.name}...`,
    });

    const file = await loadFileFromPath(source.path, source.name);
    const transcript = await transcribeFile(file, cid);
    const words = mapTranscriptToWords(transcript, source.id);

    // Track sources with no words (transcriptless)
    if (words.length === 0) {
      transcriptlessSourceIds.push(source.id);
    }

    allWords.push(...words);
  }

  // Phase 2: Group words by source
  onProgress?.({
    current: 1,
    total: 2,
    message: "Grouping words...",
  });

  const wordsBySource = new Map<string, Word[]>();
  for (const word of allWords) {
    const sourceId = word.sourceId;
    if (!wordsBySource.has(sourceId)) {
      wordsBySource.set(sourceId, []);
    }
    wordsBySource.get(sourceId)!.push(word);
  }

  let groupOffset = 0;
  for (const [sourceId, words] of wordsBySource) {
    const groups = groupWords(words, sourceId);
    // Offset group IDs to be globally unique
    const prefixedGroups = groups.map((g, idx) => ({
      ...g,
      groupId: `group-${groupOffset + idx}`,
    }));
    allGroups.push(...prefixedGroups);
    groupOffset += groups.length;
  }

  // Create fallback groups for transcriptless sources
  for (const sourceId of transcriptlessSourceIds) {
    const source = sources.find((s) => s.id === sourceId);
    if (!source) continue;

    const fallbackGroup: SegmentGroup = {
      groupId: `group-${groupOffset++}`,
      sourceId: source.id,
      segmentIds: [],
      text: `[${source.name}]`,
      startTime: 0,
      endTime: source.duration ?? 10,
      avgConfidence: 1,
    };
    allGroups.push(fallbackGroup);
  }

  // Phase 3: Assembly cut (if multiple groups)
  let orderedGroupIds: string[];

  if (allGroups.length > 1 && sources.length > 1) {
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

      // Use Claude's recommended order, filtering to valid IDs
      const validIds = new Set(allGroups.map((g) => g.groupId));
      orderedGroupIds = result.orderedSegmentIds.filter((id) => validIds.has(id));

      // Add any missing groups at the end (in case Claude missed some)
      for (const group of allGroups) {
        if (!orderedGroupIds.includes(group.groupId)) {
          orderedGroupIds.push(group.groupId);
        }
      }
    } catch (error) {
      // If assembly cut fails, just use chronological order
      console.warn("Assembly cut failed, using chronological order:", error);
      orderedGroupIds = allGroups.map((g) => g.groupId);
    }
  } else {
    // Single source or few groups: use chronological order
    orderedGroupIds = allGroups.map((g) => g.groupId);
  }

  // Phase 4: Extract sentences from groups
  const sentences = extractSentences(allGroups, allWords);
  const orderedSentenceIds = sentences.map((s) => s.sentenceId);

  return {
    words: allWords,
    segmentGroups: allGroups,
    orderedGroupIds,
    sentences,
    orderedSentenceIds,
    transcriptlessSourceIds,
  };
}
