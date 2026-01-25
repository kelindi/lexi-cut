import { X, ArrowCounterClockwise, Trash } from "@phosphor-icons/react";
import { useHistoryStore } from "../../stores/useHistoryStore";

/**
 * History Panel - Shows operation history with selective undo
 *
 * Each operation can be individually undone by clicking the X button,
 * regardless of when it was performed.
 */
export function HistoryPanel() {
  const commands = useHistoryStore((s) => s.commands);
  const undoCommand = useHistoryStore((s) => s.undoCommand);
  const undoLast = useHistoryStore((s) => s.undoLast);
  const clearHistory = useHistoryStore((s) => s.clearHistory);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="p-4 bg-neutral-900 border border-neutral-700 rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded">
            HISTORY
          </span>
          <h3 className="text-sm font-medium text-neutral-200">
            Selective Undo ({commands.length} operations)
          </h3>
        </div>

        <div className="flex gap-2">
          <button
            onClick={undoLast}
            disabled={commands.length === 0}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
              commands.length > 0
                ? "bg-amber-600 hover:bg-amber-500 text-white"
                : "bg-neutral-700 text-neutral-500 cursor-not-allowed"
            }`}
          >
            <ArrowCounterClockwise size={12} />
            Undo Last
          </button>
          <button
            onClick={clearHistory}
            disabled={commands.length === 0}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
              commands.length > 0
                ? "bg-neutral-600 hover:bg-neutral-500 text-white"
                : "bg-neutral-700 text-neutral-500 cursor-not-allowed"
            }`}
          >
            <Trash size={12} />
            Clear
          </button>
        </div>
      </div>

      {commands.length === 0 ? (
        <div className="text-center py-8 text-neutral-500 text-sm">
          No operations recorded yet.
          <br />
          <span className="text-xs">Use the agentic functions to add operations to history.</span>
        </div>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {/* Show most recent first */}
          {[...commands].reverse().map((command, idx) => (
            <div
              key={command.id}
              className="flex items-center gap-2 p-2 bg-neutral-800 rounded group hover:bg-neutral-750"
            >
              <button
                onClick={() => undoCommand(command.id)}
                className="flex-shrink-0 p-1 rounded bg-neutral-700 hover:bg-red-600 text-neutral-400 hover:text-white transition-colors"
                title="Undo this operation"
              >
                <X size={12} weight="bold" />
              </button>

              <div className="flex-1 min-w-0">
                <div className="text-sm text-neutral-200 truncate">{command.label}</div>
                <div className="text-xs text-neutral-500 font-mono">
                  {formatTime(command.timestamp)}
                </div>
              </div>

              <div className="text-xs text-neutral-600 font-mono">
                #{commands.length - idx}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-neutral-700 pt-3 text-xs text-neutral-500">
        Click <X size={10} className="inline" weight="bold" /> on any operation to selectively undo
        it without affecting other operations.
      </div>
    </div>
  );
}
