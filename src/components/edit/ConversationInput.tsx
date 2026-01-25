import { useState, useRef, useEffect } from "react";

const SUGGESTIONS = [
  { label: "Remove ums and ahs", prompt: "Remove all filler words like um, uh, ah, hmm, and like" },
  { label: "Remove long pauses", prompt: "Remove any long pauses or silences" },
  { label: "Remove repeated words", prompt: "Remove any stutters or repeated words" },
  { label: "Tighten pacing", prompt: "Remove unnecessary pauses to make the pacing tighter" },
];

interface ConversationInputProps {
  onSubmit: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ConversationInput({
  onSubmit,
  placeholder = "Tell me how to edit your video...",
  disabled = false,
}: ConversationInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSubmit(trimmed);
      setValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (prompt: string) => {
    if (!disabled) {
      onSubmit(prompt);
    }
  };

  return (
    <div className="flex items-center justify-center w-full h-full px-4">
      <div className="w-full max-w-2xl space-y-3">
        {/* Suggestion buttons */}
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((suggestion, index) => (
            <button
              key={suggestion.label}
              onClick={() => handleSuggestionClick(suggestion.prompt)}
              disabled={disabled}
              className="btn-press px-3 py-1.5 text-xs font-medium text-white/70 bg-transparent hover:bg-white/5 border border-white/10 hover:border-white/20 rounded transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed animate-fade-in-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {suggestion.label}
            </button>
          ))}
        </div>

        {/* Input box */}
        <div className="relative bg-[#1a1a1a] rounded-lg border border-white/10 focus-within:border-white/20 transition-colors">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="w-full bg-transparent text-white placeholder:text-white/30 px-3 py-2.5 pr-10 resize-none focus:outline-none text-sm leading-relaxed"
          />
          <button
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            className="btn-press absolute right-2 bottom-2 p-1.5 rounded bg-[#333] hover:bg-[#444] disabled:bg-neutral-800 disabled:text-neutral-600 text-white transition-all hover:scale-110"
            aria-label="Send message"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
            >
              <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
            </svg>
          </button>
        </div>
        <p className="text-center text-xs text-neutral-500">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
