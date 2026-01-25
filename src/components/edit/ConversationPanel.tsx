/**
 * ConversationPanel - Unified conversation and action history with streaming
 *
 * Shows messages and tool actions in a single list where:
 * - Latest items appear at the top
 * - Actions are grouped under assistant messages with a dropdown for selective undo
 * - User messages and assistant responses are displayed inline
 * - Assistant text streams in real-time
 * - "Undo All" button undoes all actions in a batch
 */

import { useState, useCallback, useRef } from "react";
import { ArrowClockwise, ChatCircle, Wrench, CaretDown } from "@phosphor-icons/react";
import { Menu } from "@base-ui/react/menu";
import { useHistoryStore } from "../../stores/useHistoryStore";
import { executeAgenticEdit } from "../../api/agenticEdit";

// Action performed by the assistant
interface ActionItem {
  id: string;
  content: string;
  commandId: string;
  timestamp: number;
}

// Message in the conversation (user or assistant)
interface ConversationMessage {
  id: string;
  type: "user_message" | "assistant_message";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  // Actions grouped under this assistant message
  actions: ActionItem[];
}

const SUGGESTIONS = [
  { label: "Remove ums and ahs", prompt: "Remove all filler words like um, uh, ah, hmm, and like" },
  { label: "Remove repeated words", prompt: "Remove any stutters or repeated words" },
  { label: "Tighten pacing", prompt: "Remove unnecessary pauses to make the pacing tighter" },
];

export function ConversationPanel() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Ref to track the current streaming message ID
  const streamingMessageIdRef = useRef<string | null>(null);

  const commands = useHistoryStore((s) => s.commands);
  const undoCommand = useHistoryStore((s) => s.undoCommand);

  // Handle submitting a message
  const handleSubmit = useCallback(async (message: string) => {
    if (!message.trim() || isProcessing) return;

    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      type: "user_message",
      content: message,
      timestamp: Date.now(),
      actions: [],
    };

    // Create a streaming assistant message placeholder
    const streamingId = crypto.randomUUID();
    streamingMessageIdRef.current = streamingId;
    const streamingMessage: ConversationMessage = {
      id: streamingId,
      type: "assistant_message",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
      actions: [],
    };

    setMessages((prev) => [...prev, userMessage, streamingMessage]);
    setInputValue("");
    setIsProcessing(true);

    try {
      await executeAgenticEdit(message, {
        // Stream text deltas into the assistant message
        onTextDelta: (text) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingId
                ? { ...msg, content: msg.content + text }
                : msg
            )
          );
        },

        // When a tool completes, add action to the assistant message's actions array
        onToolComplete: (toolName, result, commandId) => {
          if (commandId) {
            const command = useHistoryStore.getState().commands.find((c) => c.id === commandId);
            const actionItem: ActionItem = {
              id: crypto.randomUUID(),
              content: command?.label || `${toolName}: ${result}`,
              commandId,
              timestamp: Date.now(),
            };
            // Add action to the streaming message's actions array
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === streamingId
                  ? { ...msg, actions: [...msg.actions, actionItem] }
                  : msg
              )
            );
          }
        },

        // When complete, finalize the streaming message
        onComplete: (finalMessage) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingId
                ? { ...msg, content: finalMessage || msg.content, isStreaming: false }
                : msg
            )
          );
          streamingMessageIdRef.current = null;
        },

        // On error, update the streaming message with error
        onError: (error) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingId
                ? { ...msg, content: `Error: ${error.message}`, isStreaming: false }
                : msg
            )
          );
          streamingMessageIdRef.current = null;
        },
      });
    } catch (err) {
      // Error already handled by onError callback, but just in case
      const errorMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === streamingId
            ? { ...msg, content: `Error: ${errorMsg}`, isStreaming: false }
            : msg
        )
      );
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing]);

  // Handle undoing a single action within a message
  const handleUndoSingleAction = useCallback((messageId: string, actionId: string, commandId: string) => {
    undoCommand(commandId);
    // Remove the action from the message
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, actions: msg.actions.filter((a) => a.id !== actionId) }
          : msg
      )
    );
  }, [undoCommand]);

  // Handle undoing all actions in a message and removing the message
  const handleUndoAllActions = useCallback((message: ConversationMessage) => {
    // Undo all actions in the message
    for (const action of message.actions) {
      undoCommand(action.commandId);
    }
    // Remove the message from the list
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
  }, [undoCommand]);

  // Handle removing a message (undoes all actions if it's an assistant message with actions)
  const handleRemoveMessage = useCallback((message: ConversationMessage) => {
    if (message.type === "assistant_message" && message.actions.length > 0) {
      handleUndoAllActions(message);
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
    }
  }, [handleUndoAllActions]);

  // Check if an action's command still exists (hasn't been undone elsewhere)
  const isCommandActive = useCallback((commandId: string) => {
    return commands.some((c) => c.id === commandId);
  }, [commands]);

  // Get active actions for a message (filter out undone ones)
  const getActiveActions = useCallback((actions: ActionItem[]) => {
    return actions.filter((a) => isCommandActive(a.commandId));
  }, [isCommandActive]);

  return (
    <div className="h-full flex flex-col bg-neutral-900">
      {/* Conversation/action list */}
      <div className="flex-1 overflow-y-auto flex flex-col-reverse">
        {messages.length === 0 ? (
          <div className="p-4 text-center text-neutral-500 text-sm mt-auto">
            Your edits will appear here
          </div>
        ) : (
          <div className="divide-y divide-neutral-800 mt-auto">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                activeActions={getActiveActions(message.actions)}
                onRemove={() => handleRemoveMessage(message)}
                onUndoAction={(actionId, commandId) =>
                  handleUndoSingleAction(message.id, actionId, commandId)
                }
                onUndoAll={() => handleUndoAllActions(message)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input area at bottom */}
      <div className="shrink-0 p-3 border-t border-neutral-800">
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
    </div>
  );
}

interface MessageRowProps {
  message: ConversationMessage;
  activeActions: ActionItem[];
  onRemove: () => void;
  onUndoAction: (actionId: string, commandId: string) => void;
  onUndoAll: () => void;
}

function MessageRow({ message, activeActions, onRemove, onUndoAction, onUndoAll }: MessageRowProps) {
  const isUser = message.type === "user_message";
  const hasActions = activeActions.length > 0;

  return (
    <div className="group px-3 py-2 hover:bg-neutral-800/50">
      {/* Message header and content */}
      <div className="flex items-start gap-2">
        <div className="shrink-0 mt-0.5">
          <ChatCircle size={14} className={isUser ? "text-blue-400" : "text-green-400"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-400">
              {isUser ? "You" : "Assistant"}
            </span>
            {message.isStreaming && (
              <span className="text-xs text-green-400 animate-pulse">thinking...</span>
            )}
          </div>
          <p className="text-sm text-neutral-200 break-words whitespace-pre-wrap">
            {message.content || (message.isStreaming ? "..." : "")}
          </p>
        </div>

        {/* Actions section for assistant messages */}
        {!message.isStreaming && !isUser && hasActions && (
          <div className="shrink-0 flex items-center gap-1">
            {/* Actions dropdown */}
            <Menu.Root>
              <Menu.Trigger className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-400 bg-neutral-800 hover:bg-neutral-700 hover:text-neutral-200 rounded transition-colors">
                <Wrench size={12} />
                <span>{activeActions.length} action{activeActions.length !== 1 ? 's' : ''}</span>
                <CaretDown size={10} />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner className="z-50">
                  <Menu.Popup className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl py-1 min-w-[200px] max-w-[300px]">
                    <div className="px-2 py-1.5 text-xs text-neutral-500 border-b border-neutral-700">
                      Click to undo individually
                    </div>
                    {activeActions.map((action) => (
                      <Menu.Item
                        key={action.id}
                        onClick={() => onUndoAction(action.id, action.commandId)}
                        className="px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-700 cursor-pointer flex items-start gap-2"
                      >
                        <Wrench size={12} className="text-amber-400 mt-0.5 shrink-0" />
                        <span className="break-words">{action.content}</span>
                      </Menu.Item>
                    ))}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>

            {/* Undo All button */}
            <button
              onClick={onUndoAll}
              className="px-2 py-1 text-xs text-neutral-400 bg-neutral-800 hover:bg-red-900/50 hover:text-red-400 rounded transition-colors"
            >
              Undo All
            </button>
          </div>
        )}

        {/* Remove button for user messages or assistant messages without actions */}
        {!message.isStreaming && (isUser || !hasActions) && (
          <button
            onClick={onRemove}
            className="shrink-0 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
