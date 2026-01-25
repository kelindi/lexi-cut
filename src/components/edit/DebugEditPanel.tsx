import { useState } from "react";
import { useProjectStore } from "../../stores/useProjectStore";
import {
  deleteWords,
  restoreWords,
  reorderSentences,
  getWordsWithIds,
  getAgentContext,
} from "../../stores/useAgenticStore";

/**
 * Debug panel for testing agent word deletion/restoration by IDs.
 * This is a temporary component for validating the store actions work correctly.
 *
 * Usage:
 * 1. Select a sentence ID from the dropdown
 * 2. Click on words to add their IDs to the input
 * 3. Click Delete or Restore to test the actions
 * 4. Use the swap section to switch two sentences
 *
 * All operations are now recorded in history for selective undo.
 */
export function DebugEditPanel() {
  const [selectedSentenceId, setSelectedSentenceId] = useState<string>("");
  const [wordIdsInput, setWordIdsInput] = useState<string>("");
  const [lastResult, setLastResult] = useState<string>("");
  const [showAllWords, setShowAllWords] = useState(false);
  const [showAgentContext, setShowAgentContext] = useState(false);
  const [reorderSequence, setReorderSequence] = useState<string[]>([]);

  const timeline = useProjectStore((s) => s.timeline);
  const sentences = useProjectStore((s) => s.sentences);
  const words = useProjectStore((s) => s.words);

  // Get the selected sentence and its words
  const selectedSentence = sentences.find((s) => s.sentenceId === selectedSentenceId);
  const selectedEntry = timeline.entries.find((e) => e.sentenceId === selectedSentenceId);

  const sentenceWords = selectedSentence
    ? selectedSentence.wordIds.map((id, idx) => {
        const word = words.find((w) => w.id === id);
        const isExcluded = selectedEntry?.excludedWordIds.includes(id) ?? false;
        return { idx, id, word: word?.word ?? "?", isExcluded };
      })
    : [];

  const parseWordIds = (): string[] => {
    return wordIdsInput
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  const handleDelete = () => {
    if (!selectedSentenceId) {
      setLastResult("Error: No sentence selected");
      return;
    }
    const ids = parseWordIds();
    if (ids.length === 0) {
      setLastResult("Error: No word IDs provided");
      return;
    }
    deleteWords(selectedSentenceId, ids);
    setLastResult(`Deleted words: [${ids.join(", ")}]`);
  };

  const handleRestore = () => {
    if (!selectedSentenceId) {
      setLastResult("Error: No sentence selected");
      return;
    }
    const ids = parseWordIds();
    if (ids.length === 0) {
      setLastResult("Error: No word IDs provided");
      return;
    }
    restoreWords(selectedSentenceId, ids);
    setLastResult(`Restored words: [${ids.join(", ")}]`);
  };

  return (
    <div className="p-4 bg-neutral-900 border border-neutral-700 rounded-lg space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
          DEBUG
        </span>
        <h3 className="text-sm font-medium text-neutral-200">
          Agent Word Edit Tester
        </h3>
      </div>

      {/* Sentence selector */}
      <div className="space-y-1">
        <label className="text-xs text-neutral-400">Sentence ID</label>
        <select
          value={selectedSentenceId}
          onChange={(e) => setSelectedSentenceId(e.target.value)}
          className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1.5 text-sm text-neutral-200 font-mono"
        >
          <option value="">Select a sentence...</option>
          {timeline.entries.map((entry) => {
            const sentence = sentences.find((s) => s.sentenceId === entry.sentenceId);
            const preview = sentence?.text.slice(0, 40) ?? "";
            return (
              <option key={entry.sentenceId} value={entry.sentenceId}>
                {entry.sentenceId}: {preview}...
              </option>
            );
          })}
        </select>
      </div>

      {/* Word preview */}
      {selectedSentence && (
        <div className="space-y-1">
          <label className="text-xs text-neutral-400">
            Words (click to add ID)
          </label>
          <div className="flex flex-wrap gap-1 p-2 bg-neutral-800 rounded text-xs font-mono">
            {sentenceWords.map(({ idx, id, word, isExcluded }) => (
              <button
                key={id}
                onClick={() => {
                  const current = parseWordIds();
                  if (!current.includes(id)) {
                    setWordIdsInput([...current, id].join(", "));
                  }
                }}
                title={id}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  isExcluded
                    ? "bg-red-900/50 text-red-300 line-through"
                    : "bg-neutral-700 text-neutral-200 hover:bg-neutral-600"
                }`}
              >
                [{idx}]{word}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Word IDs input */}
      <div className="space-y-1">
        <label className="text-xs text-neutral-400">
          Word IDs (comma-separated)
        </label>
        <input
          type="text"
          value={wordIdsInput}
          onChange={(e) => setWordIdsInput(e.target.value)}
          placeholder="e.g., word-src1-0, word-src1-2"
          className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1.5 text-sm text-neutral-200 font-mono placeholder:text-neutral-500"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded transition-colors"
        >
          Delete Words
        </button>
        <button
          onClick={handleRestore}
          className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded transition-colors"
        >
          Restore Words
        </button>
      </div>

      {/* Bulk Reorder Section */}
      <div className="border-t border-neutral-700 pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-neutral-400 font-medium">
            Sequence Reorder (click sentences in desired order)
          </label>
          {reorderSequence.length > 0 && (
            <button
              onClick={() => setReorderSequence([])}
              className="px-2 py-0.5 text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded"
            >
              Clear
            </button>
          )}
        </div>

        {/* Clickable sentence list for sequencing */}
        <div className="space-y-1 max-h-48 overflow-y-auto bg-neutral-800 rounded p-2">
          {timeline.entries.map((entry) => {
            const sentence = sentences.find((s) => s.sentenceId === entry.sentenceId);
            const preview = sentence?.text.slice(0, 40) ?? "";
            const seqIndex = reorderSequence.indexOf(entry.sentenceId);
            const isSelected = seqIndex !== -1;

            return (
              <button
                key={entry.sentenceId}
                onClick={() => {
                  if (isSelected) {
                    // Remove from sequence
                    setReorderSequence(reorderSequence.filter((id) => id !== entry.sentenceId));
                  } else {
                    // Add to sequence
                    setReorderSequence([...reorderSequence, entry.sentenceId]);
                  }
                }}
                className={`w-full text-left px-2 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-2 ${
                  isSelected
                    ? "bg-cyan-600/30 text-cyan-200 ring-1 ring-cyan-500"
                    : entry.excluded
                      ? "bg-neutral-700/50 text-neutral-500 line-through"
                      : "bg-neutral-700 text-neutral-200 hover:bg-neutral-600"
                }`}
              >
                {isSelected && (
                  <span className="text-cyan-400 font-bold w-6">{seqIndex + 1}.</span>
                )}
                {!isSelected && <span className="w-6" />}
                <span className="truncate flex-1">{preview}...</span>
                <span className="text-neutral-500 text-[10px]">{entry.sentenceId}</span>
              </button>
            );
          })}
        </div>

        {/* Sequence preview */}
        {reorderSequence.length > 0 && (
          <div className="text-xs bg-neutral-800 rounded p-2">
            <span className="text-neutral-400">New order: </span>
            <span className="text-cyan-300 font-mono">
              {reorderSequence.map((id, i) => (
                <span key={id}>
                  {i > 0 && " → "}
                  {id}
                </span>
              ))}
            </span>
          </div>
        )}

        <button
          onClick={() => {
            if (reorderSequence.length < 2) {
              setLastResult("Error: Select at least 2 sentences to reorder");
              return;
            }
            reorderSentences(reorderSequence);
            setLastResult(`Reordered ${reorderSequence.length} sentences`);
            setReorderSequence([]);
          }}
          disabled={reorderSequence.length < 2}
          className={`w-full px-3 py-1.5 text-white text-sm font-medium rounded transition-colors ${
            reorderSequence.length >= 2
              ? "bg-cyan-600 hover:bg-cyan-500"
              : "bg-neutral-700 text-neutral-500 cursor-not-allowed"
          }`}
        >
          Apply Sequence ({reorderSequence.length} selected)
        </button>
      </div>

      {/* Result feedback */}
      {lastResult && (
        <div
          className={`text-xs font-mono p-2 rounded ${
            lastResult.startsWith("Error")
              ? "bg-red-900/30 text-red-300"
              : "bg-green-900/30 text-green-300"
          }`}
        >
          {lastResult}
        </div>
      )}

      {/* Agent Context */}
      <div className="border-t border-neutral-700 pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-neutral-400">Agent Context (Full State)</label>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAgentContext(!showAgentContext)}
              className="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded transition-colors"
            >
              {showAgentContext ? "Hide" : "Show"}
            </button>
            <button
              onClick={() => {
                const text = getAgentContext();
                navigator.clipboard.writeText(text);
                setLastResult("Copied agent context to clipboard!");
              }}
              className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
            >
              Copy
            </button>
          </div>
        </div>
        {showAgentContext && (
          <pre className="text-xs font-mono text-neutral-300 bg-neutral-800 p-2 rounded overflow-auto max-h-64 whitespace-pre-wrap">
            {getAgentContext() || "(no context)"}
          </pre>
        )}
      </div>

      {/* All words with IDs */}
      <div className="border-t border-neutral-700 pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-neutral-400">All Words with IDs</label>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAllWords(!showAllWords)}
              className="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded transition-colors"
            >
              {showAllWords ? "Hide" : "Show"}
            </button>
            <button
              onClick={() => {
                const text = getWordsWithIds();
                navigator.clipboard.writeText(text);
                setLastResult("Copied all words to clipboard!");
              }}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              Copy
            </button>
          </div>
        </div>
        {showAllWords && (
          <pre className="text-xs font-mono text-neutral-300 bg-neutral-800 p-2 rounded overflow-auto max-h-64 whitespace-pre-wrap">
            {getWordsWithIds() || "(no words)"}
          </pre>
        )}
      </div>
    </div>
  );
}
