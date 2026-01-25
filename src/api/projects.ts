import { invoke } from "@tauri-apps/api/core";
import type { ProjectMeta, Source, Word, Sentence, SegmentGroup, Timeline, TimelineEntry, BrollClassification } from "../types";

export async function loadProjects(): Promise<ProjectMeta[]> {
  return invoke<ProjectMeta[]>("load_projects");
}

export async function saveProjects(projects: ProjectMeta[]): Promise<void> {
  await invoke("save_projects", { projects });
}

// --- Full Project Data ---

export interface ProjectData {
  id: string;
  name: string;
  sources: Source[];
  words: Word[];
  sentences: Sentence[];
  segmentGroups: SegmentGroup[];
  // New timeline structure
  timeline?: Timeline;
  // Deprecated (optional for migration)
  orderedSentenceIds?: string[];
  excludedSentenceIds?: string[];
  excludedWordIds?: string[];
  transcriptlessSourceIds: string[];
  // B-roll classifications (stored as array, converted to Map in store)
  brollClassifications?: BrollClassification[];
  savedAt: number;
}

/**
 * Migrate legacy flat arrays to Timeline structure.
 * Called on load if data.timeline is missing or version < 1.
 */
export function migrateToTimeline(data: ProjectData): Timeline {
  const sentenceMap = new Map(data.sentences.map((s) => [s.sentenceId, s]));
  const excludedSentenceSet = new Set(data.excludedSentenceIds ?? []);
  const excludedWordSet = new Set(data.excludedWordIds ?? []);

  // Build entries from orderedSentenceIds
  const orderedIds = data.orderedSentenceIds ?? data.sentences.map((s) => s.sentenceId);

  const entries: TimelineEntry[] = orderedIds
    .map((sentenceId): TimelineEntry | null => {
      const sentence = sentenceMap.get(sentenceId);
      if (!sentence) return null;

      // Gather excluded words that belong to this sentence
      const sentenceExcludedWordIds = sentence.wordIds.filter((wid) => excludedWordSet.has(wid));

      return {
        sentenceId,
        text: sentence.text,
        sourceId: sentence.sourceId,
        excluded: excludedSentenceSet.has(sentenceId),
        excludedWordIds: sentenceExcludedWordIds,
      };
    })
    .filter((entry): entry is TimelineEntry => entry !== null);

  return {
    version: 1,
    entries,
  };
}

/**
 * Initialize a fresh timeline from newly processed sentences.
 */
export function createTimelineFromSentences(sentences: Sentence[]): Timeline {
  return {
    version: 1,
    entries: sentences.map((sentence) => ({
      sentenceId: sentence.sentenceId,
      text: sentence.text,
      sourceId: sentence.sourceId,
      excluded: false,
      excludedWordIds: [],
    })),
  };
}

export async function saveProjectData(data: ProjectData): Promise<void> {
  // Ensure we save with timeline, not flat arrays
  const saveData = {
    ...data,
    // Only include timeline, not deprecated arrays
    orderedSentenceIds: undefined,
    excludedSentenceIds: undefined,
    excludedWordIds: undefined,
  };
  await invoke("save_project_data", { data: saveData });
}

export async function loadProjectData(projectId: string): Promise<ProjectData | null> {
  const data = await invoke<ProjectData | null>("load_project_data", { projectId });
  if (!data) return null;

  // Migrate if needed
  if (!data.timeline || data.timeline.version < 1) {
    data.timeline = migrateToTimeline(data);
  }

  return data;
}
