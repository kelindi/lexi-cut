/**
 * Agentic Store - Facade for agent operations with selective undo support
 *
 * This store wraps useProjectStore's agentic functions and records each
 * operation as a command in useHistoryStore for selective undo.
 */

import { useProjectStore } from "./useProjectStore";
import { useHistoryStore } from "./useHistoryStore";
import { useSourcesStore } from "./useSourcesStore";

// Re-export getWordsWithIds for agent context
export { getWordsWithIds } from "./useProjectStore";

/**
 * Get full agent context - the complete state for the model including
 * timeline state with source description context.
 *
 * Format:
 * ```
 * TIMELINE STATE (X sentences, Y excluded)
 * =========================================
 *
 * [1] sentence-id-123 (ACTIVE)
 *     Context: Host introduces the topic
 *     "The quick brown fox jumps over..."
 *     Words: [word-1]The [word-2]quick [word-3]~brown [word-4]fox...
 *     (~ prefix = excluded word)
 *
 * [2] sentence-id-456 (EXCLUDED)
 *     Context: Guest discusses their background
 *     "This sentence was removed..."
 * ```
 */
export function getAgentContext(): string {
  const state = useProjectStore.getState();
  const sources = useSourcesStore.getState().sources;
  const wordMap = new Map(state.words.map((w) => [w.id, w]));

  const totalSentences = state.timeline.entries.length;
  const excludedSentences = state.timeline.entries.filter((e) => e.excluded).length;

  const lines: string[] = [];

  // Build a map of sentence index by sentenceId for quick lookup
  const sentenceIndexMap = new Map<string, number>();
  state.timeline.entries.forEach((entry, index) => {
    sentenceIndexMap.set(entry.sentenceId, index + 1);
  });

  // Build a map from sourceId to its descriptions for quick lookup
  const sourceDescriptionsMap = new Map(
    sources.map((source) => [source.id, source.descriptions || []])
  );

  // Helper to find description context for a sentence
  const getDescriptionContext = (sentence: typeof state.sentences[0]): string | null => {
    const descriptions = sourceDescriptionsMap.get(sentence.sourceId);
    if (!descriptions || descriptions.length === 0) return null;

    // Find description that overlaps with this sentence's time range
    const matchingDesc = descriptions.find(
      (desc) => sentence.startTime < desc.end && sentence.endTime > desc.start
    );

    return matchingDesc?.description || null;
  };

  // Timeline state section
  lines.push(`TIMELINE STATE (${totalSentences} sentences, ${excludedSentences} excluded)`);
  lines.push("=========================================");
  lines.push("");

  state.timeline.entries.forEach((entry, index) => {
    const sentence = state.sentences.find((s) => s.sentenceId === entry.sentenceId);
    if (!sentence) return;

    const status = entry.excluded ? "EXCLUDED" : "ACTIVE";
    const excludedWordIds = new Set(entry.excludedWordIds);
    const excludedWordCount = excludedWordIds.size;
    const context = getDescriptionContext(sentence);

    // Sentence header
    lines.push(`[${index + 1}] ${entry.sentenceId} (${status})`);

    // Context from source description (if available)
    if (context) {
      lines.push(`    Context: ${context}`);
    }

    // Sentence text preview
    const preview = sentence.text.slice(0, 80) + (sentence.text.length > 80 ? "..." : "");
    lines.push(`    "${preview}"`);

    // Word-level detail (only for active sentences)
    if (!entry.excluded) {
      const wordsStr = sentence.wordIds
        .map((wordId) => {
          const word = wordMap.get(wordId);
          if (!word) return null;
          const excluded = excludedWordIds.has(wordId);
          return `[${wordId}]${excluded ? "~" : ""}${word.word}`;
        })
        .filter(Boolean)
        .join(" ");

      lines.push(`    Words: ${wordsStr}`);

      if (excludedWordCount > 0) {
        lines.push(`    (${excludedWordCount} word(s) excluded, marked with ~)`);
      }
    }

    lines.push(""); // Blank line between sentences
  });

  // Add legend
  lines.push("---");
  lines.push("LEGEND:");
  lines.push("  [id] = ID to use in function calls");
  lines.push("  ~ prefix = excluded/deleted");
  lines.push("  ACTIVE = visible in timeline");
  lines.push("  EXCLUDED = removed from timeline");

  // Add available B-roll sources section
  const transcriptlessSources = sources.filter(
    (s) => state.transcriptlessSourceIds.includes(s.id)
  );
  if (transcriptlessSources.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("AVAILABLE B-ROLL SOURCES");
    lines.push("========================");
    lines.push("These are transcriptless video sources for video overrides.");
    lines.push("When applied: B-roll VIDEO plays while the sentence's original AUDIO continues.");
    lines.push("(B-roll audio is muted - only the video is used)");
    lines.push("");
    transcriptlessSources.forEach((source) => {
      const duration = source.duration?.toFixed(1) ?? "unknown";
      lines.push(`Source ID: ${source.id}`);
      lines.push(`  Name: "${source.name}"`);
      lines.push(`  Duration: ${duration}s`);
      // Include visual descriptions if available
      if (source.descriptions && source.descriptions.length > 0) {
        lines.push(`  Visual content:`);
        source.descriptions.forEach((d) => {
          lines.push(`    ${d.start.toFixed(1)}s-${d.end.toFixed(1)}s: ${d.description}`);
        });
      }
      lines.push("");
    });
  }

  return lines.join("\n");
}

/**
 * Get a compact list of sentences for quick reference.
 *
 * Format:
 * ```
 * sentence-id-123: "The quick brown fox..." (ACTIVE, 2 words excluded)
 * sentence-id-456: "Another sentence..." (EXCLUDED)
 * ```
 */
export function getSentenceList(): string {
  const state = useProjectStore.getState();

  return state.timeline.entries
    .map((entry) => {
      const sentence = state.sentences.find((s) => s.sentenceId === entry.sentenceId);
      if (!sentence) return null;

      const status = entry.excluded ? "EXCLUDED" : "ACTIVE";
      const excludedWordCount = entry.excludedWordIds.length;
      const preview = sentence.text.slice(0, 50) + (sentence.text.length > 50 ? "..." : "");

      let line = `${entry.sentenceId}: "${preview}" (${status}`;
      if (!entry.excluded && excludedWordCount > 0) {
        line += `, ${excludedWordCount} word(s) excluded`;
      }
      line += ")";

      return line;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Delete words by IDs with history tracking
 */
export function deleteWords(sentenceId: string, wordIds: string[]): string {
  const { deleteWordsByIds, restoreWordsByIds } = useProjectStore.getState();
  const { pushCommand } = useHistoryStore.getState();

  // Get word text for label
  const state = useProjectStore.getState();
  const wordMap = new Map(state.words.map((w) => [w.id, w]));
  const wordTexts = wordIds
    .map((id) => wordMap.get(id)?.word)
    .filter(Boolean)
    .slice(0, 3);
  const label =
    wordTexts.length > 0
      ? `Deleted words: "${wordTexts.join(", ")}"${wordIds.length > 3 ? ` (+${wordIds.length - 3} more)` : ""}`
      : `Deleted ${wordIds.length} word(s)`;

  // Execute the operation
  deleteWordsByIds(sentenceId, wordIds);

  // Record command for undo
  return pushCommand({
    label,
    execute: () => deleteWordsByIds(sentenceId, wordIds),
    undo: () => restoreWordsByIds(sentenceId, wordIds),
  });
}

/**
 * Restore words by IDs with history tracking
 */
export function restoreWords(sentenceId: string, wordIds: string[]): string {
  const { deleteWordsByIds, restoreWordsByIds } = useProjectStore.getState();
  const { pushCommand } = useHistoryStore.getState();

  // Get word text for label
  const state = useProjectStore.getState();
  const wordMap = new Map(state.words.map((w) => [w.id, w]));
  const wordTexts = wordIds
    .map((id) => wordMap.get(id)?.word)
    .filter(Boolean)
    .slice(0, 3);
  const label =
    wordTexts.length > 0
      ? `Restored words: "${wordTexts.join(", ")}"${wordIds.length > 3 ? ` (+${wordIds.length - 3} more)` : ""}`
      : `Restored ${wordIds.length} word(s)`;

  // Execute the operation
  restoreWordsByIds(sentenceId, wordIds);

  // Record command for undo (undo of restore = delete)
  return pushCommand({
    label,
    execute: () => restoreWordsByIds(sentenceId, wordIds),
    undo: () => deleteWordsByIds(sentenceId, wordIds),
  });
}

/**
 * Delete sentences by IDs with history tracking
 */
export function deleteSentences(sentenceIds: string[]): string {
  const { deleteSentencesByIds, restoreSentencesByIds } = useProjectStore.getState();
  const { pushCommand } = useHistoryStore.getState();

  // Get sentence preview for label
  const state = useProjectStore.getState();
  const wordMap = new Map(state.words.map((w) => [w.id, w]));
  const previews = sentenceIds.slice(0, 2).map((sentenceId) => {
    const sentence = state.sentences.find((s) => s.sentenceId === sentenceId);
    if (!sentence) return "...";
    const words = sentence.wordIds
      .slice(0, 4)
      .map((id) => wordMap.get(id)?.word)
      .filter(Boolean)
      .join(" ");
    return words + (sentence.wordIds.length > 4 ? "..." : "");
  });
  const label =
    previews.length > 0
      ? `Deleted: "${previews.join('", "')}"${sentenceIds.length > 2 ? ` (+${sentenceIds.length - 2} more)` : ""}`
      : `Deleted ${sentenceIds.length} sentence(s)`;

  // Execute the operation
  deleteSentencesByIds(sentenceIds);

  // Record command for undo
  return pushCommand({
    label,
    execute: () => deleteSentencesByIds(sentenceIds),
    undo: () => restoreSentencesByIds(sentenceIds),
  });
}

/**
 * Restore sentences by IDs with history tracking
 */
export function restoreSentences(sentenceIds: string[]): string {
  const { deleteSentencesByIds, restoreSentencesByIds } = useProjectStore.getState();
  const { pushCommand } = useHistoryStore.getState();

  // Get sentence preview for label
  const state = useProjectStore.getState();
  const wordMap = new Map(state.words.map((w) => [w.id, w]));
  const previews = sentenceIds.slice(0, 2).map((sentenceId) => {
    const sentence = state.sentences.find((s) => s.sentenceId === sentenceId);
    if (!sentence) return "...";
    const words = sentence.wordIds
      .slice(0, 4)
      .map((id) => wordMap.get(id)?.word)
      .filter(Boolean)
      .join(" ");
    return words + (sentence.wordIds.length > 4 ? "..." : "");
  });
  const label =
    previews.length > 0
      ? `Restored: "${previews.join('", "')}"${sentenceIds.length > 2 ? ` (+${sentenceIds.length - 2} more)` : ""}`
      : `Restored ${sentenceIds.length} sentence(s)`;

  // Execute the operation
  restoreSentencesByIds(sentenceIds);

  // Record command for undo (undo of restore = delete)
  return pushCommand({
    label,
    execute: () => restoreSentencesByIds(sentenceIds),
    undo: () => deleteSentencesByIds(sentenceIds),
  });
}

/**
 * Reorder sentences by ID array with history tracking
 */
export function reorderSentences(newOrder: string[]): string {
  const { reorderSentencesById } = useProjectStore.getState();
  const { pushCommand } = useHistoryStore.getState();

  // Capture current order for undo
  const state = useProjectStore.getState();
  const previousOrder = state.timeline.entries.map((e) => e.sentenceId);

  const label = `Reordered ${newOrder.length} sentence(s)`;

  // Execute the operation
  reorderSentencesById(newOrder);

  // Record command for undo
  return pushCommand({
    label,
    execute: () => reorderSentencesById(newOrder),
    undo: () => reorderSentencesById(previousOrder),
  });
}

/**
 * Set video override on a sentence with history tracking
 */
export function setVideoOverride(
  sentenceId: string,
  sourceId: string,
  start: number,
  end: number
): string {
  const state = useProjectStore.getState();
  const { pushCommand } = useHistoryStore.getState();

  // Find the entry and capture previous override for undo
  const entry = state.timeline.entries.find((e) => e.sentenceId === sentenceId);
  const previousOverride = entry?.videoOverride;

  // Get source name for label
  const source = useSourcesStore.getState().sources.find((s) => s.id === sourceId);
  const sourceName = source?.name || sourceId;
  const label = `Video override: ${sourceName} (${start.toFixed(1)}s-${end.toFixed(1)}s)`;

  // Apply the override
  state.setVideoOverride(sentenceId, { sourceId, start, end });

  // Record command for undo
  return pushCommand({
    label,
    execute: () => state.setVideoOverride(sentenceId, { sourceId, start, end }),
    undo: () => state.setVideoOverride(sentenceId, previousOverride ?? null),
  });
}

/**
 * Clear video override from a sentence with history tracking
 */
export function clearVideoOverride(sentenceId: string): string {
  const state = useProjectStore.getState();
  const { pushCommand } = useHistoryStore.getState();

  // Find the entry and capture previous override for undo
  const entry = state.timeline.entries.find((e) => e.sentenceId === sentenceId);
  const previousOverride = entry?.videoOverride;

  if (!previousOverride) {
    // Nothing to clear, but return a command ID anyway for consistency
    return pushCommand({
      label: "Clear video override (no-op)",
      execute: () => {},
      undo: () => {},
    });
  }

  const label = `Cleared video override from sentence`;

  // Clear the override
  state.setVideoOverride(sentenceId, null);

  // Record command for undo (restore the previous override)
  return pushCommand({
    label,
    execute: () => state.setVideoOverride(sentenceId, null),
    undo: () => state.setVideoOverride(sentenceId, previousOverride),
  });
}

// Re-export history actions for convenience
export const undoCommand = (commandId: string) => useHistoryStore.getState().undoCommand(commandId);
export const undoLast = () => useHistoryStore.getState().undoLast();
export const clearHistory = () => useHistoryStore.getState().clearHistory();
export const getCommands = () => useHistoryStore.getState().commands;

// Hook for reactive history access
export { useHistoryStore };
