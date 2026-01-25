import { create } from "zustand";
import type {
  Word,
  SegmentGroup,
  Sentence,
  ProcessingPhase,
  ProcessingProgress,
} from "../types";

interface ProjectState {
  // Project identity
  projectId: string | null;
  projectName: string | null;

  // Raw data
  words: Word[];
  segmentGroups: SegmentGroup[];
  sentences: Sentence[];

  // Editable timeline (the "screenplay") - sentence-level ordering
  orderedSentenceIds: string[];
  excludedSentenceIds: string[];

  // Word-level exclusions (for trimming individual words)
  excludedWordIds: string[];

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
  openProject: (id: string, name: string) => void;
  closeProject: () => void;

  // Actions
  setWords: (words: Word[]) => void;
  setSegmentGroups: (groups: SegmentGroup[]) => void;
  setSentences: (sentences: Sentence[]) => void;
  setOrderedSentenceIds: (ids: string[]) => void;
  reorderSentences: (fromIndex: number, toIndex: number) => void;
  excludeSentence: (id: string) => void;
  restoreSentence: (id: string) => void;
  toggleWordExclusion: (wordId: string) => void;
  // Transcriptless tracking
  setTranscriptlessSourceIds: (sourceIds: string[]) => void;
  // Legacy group actions (kept for backward compatibility)
  setOrderedGroupIds: (ids: string[]) => void;
  excludeGroup: (id: string) => void;
  restoreGroup: (id: string) => void;
  reorderGroups: (fromIndex: number, toIndex: number) => void;
  updateGroupText: (id: string, text: string) => void;
  setPhase: (phase: ProcessingPhase) => void;
  setProgress: (progress: ProcessingProgress | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  projectId: null as string | null,
  projectName: null as string | null,
  segments: [],
  words: [],
  segmentGroups: [],
  sentences: [],
  orderedSentenceIds: [],
  excludedSentenceIds: [],
  excludedWordIds: [],
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

  openProject: (id, name) =>
    set({
      ...initialState,
      projectId: id,
      projectName: name,
    }),

  closeProject: () => set(initialState),

  setSegments: (segments) => set({ segments }),
  setWords: (words) => set({ words }),

  setSegmentGroups: (groups) =>
    set({
      segmentGroups: groups,
      orderedGroupIds: groups.map((g) => g.groupId),
    }),

  // Sentence actions
  setSentences: (sentences) =>
    set({
      sentences,
      orderedSentenceIds: sentences.map((s) => s.sentenceId),
    }),

  setOrderedSentenceIds: (ids) => set({ orderedSentenceIds: ids }),

  reorderSentences: (fromIndex, toIndex) =>
    set((state) => {
      const newOrder = [...state.orderedSentenceIds];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);
      return { orderedSentenceIds: newOrder };
    }),

  excludeSentence: (id) =>
    set((state) => ({
      excludedSentenceIds: [...state.excludedSentenceIds, id],
    })),

  restoreSentence: (id) =>
    set((state) => ({
      excludedSentenceIds: state.excludedSentenceIds.filter((sid) => sid !== id),
    })),

  // Word-level exclusion (toggle)
  toggleWordExclusion: (wordId) =>
    set((state) => ({
      excludedWordIds: state.excludedWordIds.includes(wordId)
        ? state.excludedWordIds.filter((id) => id !== wordId)
        : [...state.excludedWordIds, wordId],
    })),

  // Transcriptless tracking
  setTranscriptlessSourceIds: (sourceIds) => set({ transcriptlessSourceIds: sourceIds }),

  // Legacy group actions
  setOrderedGroupIds: (ids) => set({ orderedGroupIds: ids }),

  excludeGroup: (id) =>
    set((state) => ({
      excludedGroupIds: [...state.excludedGroupIds, id],
    })),

  restoreGroup: (id) =>
    set((state) => ({
      excludedGroupIds: state.excludedGroupIds.filter((gid) => gid !== id),
    })),

  reorderGroups: (fromIndex, toIndex) =>
    set((state) => {
      const newOrder = [...state.orderedGroupIds];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);
      return { orderedGroupIds: newOrder };
    }),

  updateGroupText: (id, text) =>
    set((state) => ({
      segmentGroups: state.segmentGroups.map((g) =>
        g.groupId === id ? { ...g, text } : g
      ),
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

// Sentence selector helpers
export const useActiveSentences = () =>
  useProjectStore((state) => {
    const excluded = new Set(state.excludedSentenceIds);
    return state.orderedSentenceIds
      .filter((id) => !excluded.has(id))
      .map((id) => state.sentences.find((s) => s.sentenceId === id)!)
      .filter(Boolean);
  });

export const useSentenceById = (id: string) =>
  useProjectStore((state) => state.sentences.find((s) => s.sentenceId === id));
