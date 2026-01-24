import { create } from "zustand";

interface SelectionState {
  selectedBlockId: string | null;

  // Actions
  selectBlock: (id: string | null) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedBlockId: null,

  selectBlock: (id) => set({ selectedBlockId: id }),
  clearSelection: () => set({ selectedBlockId: null }),
}));
