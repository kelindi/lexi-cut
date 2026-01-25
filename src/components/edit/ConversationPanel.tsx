/**
 * ConversationPanel - Unified conversation and action history with streaming
 *
 * Shows messages and tool actions in a single list where:
 * - Latest items appear at the top
 * - Actions can be selectively undone by clicking delete
 * - User messages and assistant responses are displayed inline
 * - Assistant text streams in real-time
 */

import { useState, useCallback, useRef } from "react";
import { X, ArrowClockwise, ChatCircle, Wrench } from "@phosphor-icons/react";
import { useHistoryStore } from "../../stores/useHistoryStore";
import { executeAgenticEdit } from "../../api/agenticEdit";

// Item types in the conversation
type ConversationItemType = "user_message" | "assistant_message" | "action";

interface ConversationItem {
  id: string;
  type: ConversationItemType;
  content: string;
  timestamp: number;
  // For actions, link to command ID for undo
  commandId?: string;
  // For streaming messages
  isStreaming?: boolean;
}

const SUGGESTIONS = [
  { label: "Remove ums and ahs", prompt: "Remove all filler words like um, uh, ah, hmm, and like" },
  { label: "Remove repeated words", prompt: "Remove any stutters or repeated words" },
  { label: "Tighten pacing", prompt: "Remove unnecessary pauses to make the pacing tighter" },
];

export function ConversationPanel() {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Ref to track the current streaming message ID
  const streamingMessageIdRef = useRef<string | null>(null);

  const commands = useHistoryStore((s) => s.commands);
  const undoCommand = useHistoryStore((s) => s.undoCommand);

  // Handle submitting a message
  const handleSubmit = useCallback(async (message: string) => {
    if (!message.trim() || isProcessing) return;

    const userItem: ConversationItem = {
      id: crypto.randomUUID(),
      type: "user_message",
      content: message,
      timestamp: Date.now(),
    };

    // Create a streaming assistant message placeholder
    const streamingId = crypto.randomUUID();
    streamingMessageIdRef.current = streamingId;
    const streamingItem: ConversationItem = {
      id: streamingId,
      type: "assistant_message",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
    };

    setItems((prev) => [streamingItem, userItem, ...prev]);
    setInputValue("");
    setIsProcessing(true);

    try {
      await executeAgenticEdit(message, {
        // Stream text deltas into the assistant message
        onTextDelta: (text) => {
          setItems((prev) =>
            prev.map((item) =>
              item.id === streamingId
                ? { ...item, content: item.content + text }
                : item
            )
          );
        },

        // When a tool completes, add an action item
        onToolComplete: (toolName, result, commandId) => {
          if (commandId) {
            const command = useHistoryStore.getState().commands.find((c) => c.id === commandId);
            const actionItem: ConversationItem = {
              id: crypto.randomUUID(),
              type: "action",
              content: command?.label || `${toolName}: ${result}`,
              timestamp: Date.now(),
              commandId,
            };
            // Insert action after the streaming message
            setItems((prev) => {
              const streamingIndex = prev.findIndex((i) => i.id === streamingId);
              if (streamingIndex === -1) return [actionItem, ...prev];
              const newItems = [...prev];
              newItems.splice(streamingIndex + 1, 0, actionItem);
              return newItems;
            });
          }
        },

        // When complete, finalize the streaming message
        onComplete: (finalMessage) => {
          setItems((prev) =>
            prev.map((item) =>
              item.id === streamingId
                ? { ...item, content: finalMessage || item.content, isStreaming: false }
                : item
            )
          );
          streamingMessageIdRef.current = null;
        },

        // On error, update the streaming message with error
        onError: (error) => {
          setItems((prev) =>
            prev.map((item) =>
              item.id === streamingId
                ? { ...item, content: `Error: ${error.message}`, isStreaming: false }
                : item
            )
          );
          streamingMessageIdRef.current = null;
        },
      });
    } catch (err) {
      // Error already handled by onError callback, but just in case
      const errorMsg = err instanceof Error ? err.message : String(err);
      setItems((prev) =>
        prev.map((item) =>
          item.id === streamingId
            ? { ...item, content: `Error: ${errorMsg}`, isStreaming: false }
            : item
        )
      );
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing]);

  // Handle undoing an action
  const handleUndoAction = useCallback((item: ConversationItem) => {
    if (item.commandId) {
      undoCommand(item.commandId);
      // Remove the item from the list
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    }
  }, [undoCommand]);

  // Handle removing a message (non-action items just get removed from view)
  const handleRemoveItem = useCallback((item: ConversationItem) => {
    if (item.type === "action" && item.commandId) {
      handleUndoAction(item);
    } else {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    }
  }, [handleUndoAction]);

  // Check if an action's command still exists (hasn't been undone elsewhere)
  const isCommandActive = useCallback((commandId?: string) => {
    if (!commandId) return false;
    return commands.some((c) => c.id === commandId);
  }, [commands]);

  return (
    <div className="h-full flex flex-col bg-neutral-900">
      {/* Input area at top */}
      <div className="shrink-0 p-3 border-b border-neutral-800">
        {/* Suggestion chips */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => handleSubmit(s.prompt)}
              disabled={isProcessing}
              className="px-2 py-1 text-xs text-neutral-400 bg-neutral-800 hover:bg-neutral-700 hover:text-neutral-200 rounded-full transition-colors disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Input box */}
        <div className="relative">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(inputValue);
              }
            }}
            placeholder={isProcessing ? "Processing..." : "Tell me how to edit..."}
            disabled={isProcessing}
            className="w-full bg-neutral-800 text-neutral-100 placeholder:text-neutral-500 px-3 py-2 pr-10 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
          />
          <button
            onClick={() => handleSubmit(inputValue)}
            disabled={isProcessing || !inputValue.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-200 disabled:opacity-30"
          >
            <ArrowClockwise size={16} className={isProcessing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Conversation/action list */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-4 text-center text-neutral-500 text-sm">
            Your edits will appear here
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {items.map((item) => (
              <ConversationItemRow
                key={item.id}
                item={item}
                isActive={item.type !== "action" || isCommandActive(item.commandId)}
                onRemove={() => handleRemoveItem(item)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ConversationItemRowProps {
  item: ConversationItem;
  isActive: boolean;
  onRemove: () => void;
}

function ConversationItemRow({ item, isActive, onRemove }: ConversationItemRowProps) {
  const getIcon = () => {
    switch (item.type) {
      case "user_message":
        return <ChatCircle size={14} className="text-blue-400" />;
      case "assistant_message":
        return <ChatCircle size={14} className="text-green-400" />;
      case "action":
        return <Wrench size={14} className="text-amber-400" />;
    }
  };

  const getLabel = () => {
    switch (item.type) {
      case "user_message":
        return "You";
      case "assistant_message":
        return "Assistant";
      case "action":
        return "Action";
    }
  };

  return (
    <div
      className={`group flex items-start gap-2 px-3 py-2 hover:bg-neutral-800/50 ${
        !isActive ? "opacity-50" : ""
      }`}
    >
      <div className="shrink-0 mt-0.5">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-400">{getLabel()}</span>
          {item.type === "action" && isActive && (
            <span className="text-xs text-neutral-500">(click x to undo)</span>
          )}
          {item.isStreaming && (
            <span className="text-xs text-green-400 animate-pulse">streaming...</span>
          )}
        </div>
        <p className="text-sm text-neutral-200 break-words whitespace-pre-wrap">
          {item.content || (item.isStreaming ? "..." : "")}
        </p>
      </div>
      {!item.isStreaming && (
        <button
          onClick={onRemove}
          className="shrink-0 p-1 text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
          title={item.type === "action" ? "Undo this action" : "Remove"}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
