import { create } from "zustand";
import type {
  Segment,
  SegmentGroup,
  ProcessingPhase,
  ProcessingProgress,
} from "../types";

interface ProjectState {
  // Project identity
  projectId: string | null;
  projectName: string | null;

  // Raw data
  segments: Segment[];
  segmentGroups: SegmentGroup[];

  // Editable timeline (the "screenplay")
  orderedGroupIds: string[];
  excludedGroupIds: string[]; // Using array for JSON serialization

  // Processing state
  phase: ProcessingPhase;
  progress: ProcessingProgress | null;
  error: string | null;

  // Project actions
  createProject: (name: string) => void;
  openProject: (id: string, name: string) => void;
  closeProject: () => void;

  // Actions
  setSegments: (segments: Segment[]) => void;
  setSegmentGroups: (groups: SegmentGroup[]) => void;
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
  segmentGroups: [],
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

  setSegmentGroups: (groups) =>
    set({
      segmentGroups: groups,
      orderedGroupIds: groups.map((g) => g.groupId),
    }),

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
