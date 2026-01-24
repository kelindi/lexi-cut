import { create } from "zustand";
import type { Source, SourceDescription } from "../types";

interface SourcesState {
  sources: Source[];
  addSources: (sources: Source[]) => void;
  updateSourceCid: (id: string, cid: string) => void;
  updateSourceDescriptions: (id: string, descriptions: SourceDescription[]) => void;
  removeSource: (id: string) => void;
  clearSources: () => void;
}

export const useSourcesStore = create<SourcesState>((set) => ({
  sources: [],
  addSources: (newSources) =>
    set((state) => ({ sources: [...state.sources, ...newSources] })),
  updateSourceCid: (id, cid) =>
    set((state) => ({
      sources: state.sources.map((s) => (s.id === id ? { ...s, cid } : s)),
    })),
  updateSourceDescriptions: (id, descriptions) =>
    set((state) => ({
      sources: state.sources.map((s) =>
        s.id === id ? { ...s, descriptions } : s
      ),
    })),
  removeSource: (id) =>
    set((state) => ({ sources: state.sources.filter((s) => s.id !== id) })),
  clearSources: () => set({ sources: [] }),
}));
