import { create } from "zustand";
import type {
  Word,
  SegmentGroup,
  Sentence,
  Timeline,
  ProcessingPhase,
  ProcessingProgress,
  Source,
} from "../types";
import { saveProjectData, loadProjectData, createTimelineFromSentences, type ProjectData } from "../api/projects";
import { useSourcesStore } from "./useSourcesStore";

interface ProjectState {
  // Project identity
  projectId: string | null;
  projectName: string | null;

  // Dirty state tracking
  isDirty: boolean;
  lastSavedAt: number | null;

  // Raw data
  words: Word[];
  segmentGroups: SegmentGroup[];
  sentences: Sentence[];

  // First-class timeline structure
  timeline: Timeline;

  // Sources without transcripts (silent/no audio)
  transcriptlessSourceIds: string[];

  // Legacy group ordering (kept for backward compatibility during transition)
  orderedGroupIds: string[];
  excludedGroupIds: string[];

  // Processing state
  phase: ProcessingPhase;
  progress: ProcessingProgress | null;
  error: string | null;

  // Project actions
  createProject: (name: string) => void;
  openProject: (id: string, name: string) => Promise<void>;
  closeProject: () => void;
  markDirty: () => void;
  markClean: () => void;
  saveProject: (sources: Source[]) => Promise<void>;
  loadProject: (projectId: string) => Promise<ProjectData | null>;

  // Raw data actions
  setWords: (words: Word[]) => void;
  setSegmentGroups: (groups: SegmentGroup[]) => void;
  setSentences: (sentences: Sentence[]) => void;

  // Timeline actions
  initializeTimeline: (sentences: Sentence[]) => void;
  setTimeline: (timeline: Timeline) => void;
  reorderEntry: (fromIndex: number, toIndex: number) => void;
  setEntryExcluded: (sentenceId: string, excluded: boolean) => void;
  toggleWordExcluded: (sentenceId: string, wordId: string) => void;
  // Agent-only: batch operations by ID (used by agentic editing loop)
  deleteWordsByIds: (sentenceId: string, wordIds: string[]) => void;
  restoreWordsByIds: (sentenceId: string, wordIds: string[]) => void;
  deleteSentencesByIds: (sentenceIds: string[]) => void;
  restoreSentencesByIds: (sentenceIds: string[]) => void;

  // Transcriptless tracking
  setTranscriptlessSourceIds: (sourceIds: string[]) => void;

  // Legacy group actions (kept for backward compatibility)
  setOrderedGroupIds: (ids: string[]) => void;
  excludeGroup: (id: string) => void;
  restoreGroup: (id: string) => void;
  reorderGroups: (fromIndex: number, toIndex: number) => void;
  updateGroupText: (id: string, text: string) => void;

  // Processing actions
  setPhase: (phase: ProcessingPhase) => void;
  setProgress: (progress: ProcessingProgress | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const emptyTimeline: Timeline = { version: 1, entries: [] };

const initialState = {
  projectId: null as string | null,
  projectName: null as string | null,
  isDirty: false,
  lastSavedAt: null as number | null,
  segments: [],
  words: [],
  segmentGroups: [],
  sentences: [],
  timeline: emptyTimeline,
  transcriptlessSourceIds: [] as string[],
  orderedGroupIds: [],
  excludedGroupIds: [],
  phase: "idle" as ProcessingPhase,
  progress: null,
  error: null,
};

export const useProjectStore = create<ProjectState>((set) => ({
  ...initialState,

  createProject: (name) =>
    set({
      ...initialState,
      projectId: crypto.randomUUID(),
      projectName: name,
    }),

  openProject: async (id, name) => {
    // First set the project identity with initial state
    set({
      ...initialState,
      projectId: id,
      projectName: name,
    });

    // Try to load saved project data
    try {
      const data = await loadProjectData(id);
      if (data) {
        // Restore project store state
        set({
          projectId: data.id,
          projectName: data.name,
          words: data.words,
          sentences: data.sentences,
          segmentGroups: data.segmentGroups,
          timeline: data.timeline ?? emptyTimeline,
          transcriptlessSourceIds: data.transcriptlessSourceIds,
          orderedGroupIds: data.segmentGroups.map((g) => g.groupId),
          excludedGroupIds: [],
          isDirty: false,
          lastSavedAt: data.savedAt,
          // Project is ready if it has timeline entries
          phase: (data.timeline?.entries.length ?? 0) > 0 || data.segmentGroups.length > 0 ? "ready" : "idle",
        });

        // Restore sources to the sources store
        useSourcesStore.getState().setSources(data.sources);
      }
    } catch (error) {
      console.error("Failed to load project data:", error);
      // Project will open with empty state (new project or failed load)
    }
  },

  closeProject: () => {
    set(initialState);
    useSourcesStore.getState().clearSources();
  },

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false, lastSavedAt: Date.now() }),

  saveProject: async (sources: Source[]) => {
    const state = useProjectStore.getState();
    if (!state.projectId || !state.projectName) {
      throw new Error("No active project");
    }

    const data: ProjectData = {
      id: state.projectId,
      name: state.projectName,
      sources,
      words: state.words,
      sentences: state.sentences,
      segmentGroups: state.segmentGroups,
      timeline: state.timeline,
      transcriptlessSourceIds: state.transcriptlessSourceIds,
      savedAt: Date.now(),
    };

    await saveProjectData(data);
    set({ isDirty: false, lastSavedAt: Date.now() });
  },

  loadProject: async (projectId: string) => {
    const data = await loadProjectData(projectId);
    if (data) {
      set({
        projectId: data.id,
        projectName: data.name,
        words: data.words,
        sentences: data.sentences,
        segmentGroups: data.segmentGroups,
        timeline: data.timeline ?? emptyTimeline,
        transcriptlessSourceIds: data.transcriptlessSourceIds,
        orderedGroupIds: data.segmentGroups.map((g) => g.groupId),
        excludedGroupIds: [],
        isDirty: false,
        lastSavedAt: data.savedAt,
        phase: "ready",
      });
    }
    return data;
  },

  setWords: (words) => set({ words, isDirty: true }),

  setSegmentGroups: (groups) =>
    set({
      segmentGroups: groups,
      orderedGroupIds: groups.map((g) => g.groupId),
      isDirty: true,
    }),

  setSentences: (sentences) =>
    set({
      sentences,
      isDirty: true,
    }),

  // --- Timeline Actions ---

  initializeTimeline: (sentences) =>
    set({
      timeline: createTimelineFromSentences(sentences),
      isDirty: true,
    }),

  setTimeline: (timeline) => set({ timeline, isDirty: true }),

  reorderEntry: (fromIndex, toIndex) =>
    set((state) => {
      const newEntries = [...state.timeline.entries];
      const [removed] = newEntries.splice(fromIndex, 1);
      newEntries.splice(toIndex, 0, removed);
      return {
        timeline: { ...state.timeline, entries: newEntries },
        isDirty: true,
      };
    }),

  setEntryExcluded: (sentenceId, excluded) =>
    set((state) => ({
      timeline: {
        ...state.timeline,
        entries: state.timeline.entries.map((entry) =>
          entry.sentenceId === sentenceId ? { ...entry, excluded } : entry
        ),
      },
      isDirty: true,
    })),

  toggleWordExcluded: (sentenceId, wordId) =>
    set((state) => ({
      timeline: {
        ...state.timeline,
        entries: state.timeline.entries.map((entry) => {
          if (entry.sentenceId !== sentenceId) return entry;
          const excluded = entry.excludedWordIds.includes(wordId);
          return {
            ...entry,
            excludedWordIds: excluded
              ? entry.excludedWordIds.filter((id) => id !== wordId)
              : [...entry.excludedWordIds, wordId],
          };
        }),
      },
      isDirty: true,
    })),

  // Agent-only: delete words by ID
  deleteWordsByIds: (sentenceId: string, wordIds: string[]) =>
    set((state) => {
      const sentence = state.sentences.find((s) => s.sentenceId === sentenceId);
      if (!sentence) return state;

      // Only exclude word IDs that actually belong to this sentence
      const validWordIds = new Set(sentence.wordIds);
      const wordIdsToExclude = wordIds.filter((id) => validWordIds.has(id));

      return {
        timeline: {
          ...state.timeline,
          entries: state.timeline.entries.map((entry) => {
            if (entry.sentenceId !== sentenceId) return entry;
            const newExcluded = new Set(entry.excludedWordIds);
            wordIdsToExclude.forEach((id) => newExcluded.add(id));
            return { ...entry, excludedWordIds: Array.from(newExcluded) };
          }),
        },
        isDirty: true,
      };
    }),

  // Agent-only: restore words by ID
  restoreWordsByIds: (sentenceId: string, wordIds: string[]) =>
    set((state) => {
      const wordIdsToRestore = new Set(wordIds);

      return {
        timeline: {
          ...state.timeline,
          entries: state.timeline.entries.map((entry) => {
            if (entry.sentenceId !== sentenceId) return entry;
            return {
              ...entry,
              excludedWordIds: entry.excludedWordIds.filter((id) => !wordIdsToRestore.has(id)),
            };
          }),
        },
        isDirty: true,
      };
    }),

  // Agent-only: delete sentences by ID
  deleteSentencesByIds: (sentenceIds: string[]) =>
    set((state) => {
      const idsToExclude = new Set(sentenceIds);
      return {
        timeline: {
          ...state.timeline,
          entries: state.timeline.entries.map((entry) =>
            idsToExclude.has(entry.sentenceId) ? { ...entry, excluded: true } : entry
          ),
        },
        isDirty: true,
      };
    }),

  // Agent-only: restore sentences by ID
  restoreSentencesByIds: (sentenceIds: string[]) =>
    set((state) => {
      const idsToRestore = new Set(sentenceIds);
      return {
        timeline: {
          ...state.timeline,
          entries: state.timeline.entries.map((entry) =>
            idsToRestore.has(entry.sentenceId) ? { ...entry, excluded: false } : entry
          ),
        },
        isDirty: true,
      };
    }),

  // Transcriptless tracking
  setTranscriptlessSourceIds: (sourceIds) => set({ transcriptlessSourceIds: sourceIds, isDirty: true }),

  // Legacy group actions
  setOrderedGroupIds: (ids) => set({ orderedGroupIds: ids, isDirty: true }),

  excludeGroup: (id) =>
    set((state) => ({
      excludedGroupIds: [...state.excludedGroupIds, id],
      isDirty: true,
    })),

  restoreGroup: (id) =>
    set((state) => ({
      excludedGroupIds: state.excludedGroupIds.filter((gid) => gid !== id),
      isDirty: true,
    })),

  reorderGroups: (fromIndex, toIndex) =>
    set((state) => {
      const newOrder = [...state.orderedGroupIds];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);
      return { orderedGroupIds: newOrder, isDirty: true };
    }),

  updateGroupText: (id, text) =>
    set((state) => ({
      segmentGroups: state.segmentGroups.map((g) =>
        g.groupId === id ? { ...g, text } : g
      ),
      isDirty: true,
    })),

  setPhase: (phase) => set({ phase }),

  setProgress: (progress) => set({ progress }),

  setError: (error) => set({ error, phase: error ? "error" : "idle" }),

  reset: () => set(initialState),
}));

// Selector helpers
export const useActiveGroups = () =>
  useProjectStore((state) => {
    const excluded = new Set(state.excludedGroupIds);
    return state.orderedGroupIds
      .filter((id) => !excluded.has(id))
      .map((id) => state.segmentGroups.find((g) => g.groupId === id)!)
      .filter(Boolean);
  });

export const useGroupById = (id: string) =>
  useProjectStore((state) => state.segmentGroups.find((g) => g.groupId === id));

// --- Timeline Selectors ---

/**
 * Returns all non-excluded timeline entries in order.
 */
export const useActiveEntries = () =>
  useProjectStore((state) =>
    state.timeline.entries.filter((entry) => !entry.excluded)
  );

/**
 * Returns a single timeline entry by sentence ID.
 */
export const useTimelineEntry = (sentenceId: string) =>
  useProjectStore((state) =>
    state.timeline.entries.find((entry) => entry.sentenceId === sentenceId)
  );

/**
 * Returns the sentence object for a given ID.
 */
export const useSentenceById = (id: string) =>
  useProjectStore((state) => state.sentences.find((s) => s.sentenceId === id));

/**
 * Returns sentences ordered by timeline, including their exclusion state.
 */
export const useActiveSentences = () =>
  useProjectStore((state) => {
    const sentenceMap = new Map(state.sentences.map((s) => [s.sentenceId, s]));
    return state.timeline.entries
      .filter((entry) => !entry.excluded)
      .map((entry) => sentenceMap.get(entry.sentenceId)!)
      .filter(Boolean);
  });

/**
 * Returns all words as a formatted string with word IDs.
 * Format: "[wordId] word" for each word, grouped by sentence.
 * Useful for agent context to reference words by ID.
 */
export function getWordsWithIds(): string {
  const state = useProjectStore.getState();
  const wordMap = new Map(state.words.map((w) => [w.id, w]));

  return state.timeline.entries
    .filter((entry) => !entry.excluded)
    .map((entry) => {
      const sentence = state.sentences.find((s) => s.sentenceId === entry.sentenceId);
      if (!sentence) return "";

      const excludedSet = new Set(entry.excludedWordIds);
      const wordsStr = sentence.wordIds
        .map((wordId) => {
          const word = wordMap.get(wordId);
          if (!word) return null;
          const excluded = excludedSet.has(wordId);
          return `[${wordId}]${excluded ? "~" : ""}${word.word}`;
        })
        .filter(Boolean)
        .join(" ");

      return `${entry.sentenceId}: ${wordsStr}`;
    })
    .filter((line) => line.length > 0)
    .join("\n");
}
