import { create } from "zustand";

interface SelectionState {
  selectedSentenceId: string | null;
  selectedWordId: string | null;
  selectSentence: (id: string | null) => void;
  selectWord: (id: string | null) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedSentenceId: null,
  selectedWordId: null,

  selectSentence: (id) => set({ selectedSentenceId: id }),

  selectWord: (id) => set({ selectedWordId: id }),

  clearSelection: () => set({ selectedSentenceId: null, selectedWordId: null }),
}));
