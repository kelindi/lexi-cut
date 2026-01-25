import { useState } from "react";
import { useProjectStore } from "../../stores/useProjectStore";

/**
 * Debug panel for testing agent word deletion/restoration by IDs.
 * This is a temporary component for validating the store actions work correctly.
 *
 * Usage:
 * 1. Select a sentence ID from the dropdown
 * 2. Click on words to add their IDs to the input
 * 3. Click Delete or Restore to test the actions
 */
export function DebugEditPanel() {
  const [selectedSentenceId, setSelectedSentenceId] = useState<string>("");
  const [wordIdsInput, setWordIdsInput] = useState<string>("");
  const [lastResult, setLastResult] = useState<string>("");

  const timeline = useProjectStore((s) => s.timeline);
  const sentences = useProjectStore((s) => s.sentences);
  const words = useProjectStore((s) => s.words);
  const deleteWordsByIds = useProjectStore((s) => s.deleteWordsByIds);
  const restoreWordsByIds = useProjectStore((s) => s.restoreWordsByIds);

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
    deleteWordsByIds(selectedSentenceId, ids);
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
    restoreWordsByIds(selectedSentenceId, ids);
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
    </div>
  );
}
