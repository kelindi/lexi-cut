import { create } from "zustand";

export interface Command {
  id: string;
  label: string;
  timestamp: number;
  execute: () => void;
  undo: () => void;
}

interface HistoryState {
  commands: Command[];

  // Add a command to history (called after execute)
  pushCommand: (command: Omit<Command, "id" | "timestamp">) => string;

  // Undo a specific command by ID (selective undo)
  undoCommand: (commandId: string) => void;

  // Undo the most recent command
  undoLast: () => void;

  // Clear all history
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  commands: [],

  pushCommand: (command) => {
    const id = crypto.randomUUID();
    const fullCommand: Command = {
      ...command,
      id,
      timestamp: Date.now(),
    };

    set((state) => ({
      commands: [...state.commands, fullCommand],
    }));

    return id;
  },

  undoCommand: (commandId) => {
    const { commands } = get();
    const command = commands.find((c) => c.id === commandId);

    if (command) {
      // Execute the undo
      command.undo();

      // Remove from history
      set((state) => ({
        commands: state.commands.filter((c) => c.id !== commandId),
      }));
    }
  },

  undoLast: () => {
    const { commands, undoCommand } = get();
    if (commands.length > 0) {
      const lastCommand = commands[commands.length - 1];
      undoCommand(lastCommand.id);
    }
  },

  clearHistory: () => set({ commands: [] }),
}));
