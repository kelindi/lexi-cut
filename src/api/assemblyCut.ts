import type { Word, SegmentGroup } from "../types";

const SENTENCE_ENDINGS = /[.!?]$/;

/**
 * Groups words into sentence-like segments for the assembly cut.
 * Splits on sentence boundaries or when reaching max words per group.
 */
export function groupWordsForAssembly(
  words: Word[],
  maxWordsPerGroup: number = 8
): SegmentGroup[] {
  const groups: SegmentGroup[] = [];
  let currentGroup: Word[] = [];
  let currentSourceId: string | null = null;

  function flushGroup() {
    if (currentGroup.length === 0) return;

    const sourceId = currentSourceId!;
    const wordIds = currentGroup.map((w) => w.id);
    const texts = currentGroup.map((w) => w.word);
    const confidences = currentGroup.map((w) => w.confidence);
    const starts = currentGroup.map((w) => w.start);
    const ends = currentGroup.map((w) => w.end);

    groups.push({
      groupId: `group-${groups.length}`,
      sourceId,
      segmentIds: wordIds, // Note: these are word IDs (legacy field name)
      text: texts.join(" "),
      startTime: Math.min(...starts),
      endTime: Math.max(...ends),
      avgConfidence:
        confidences.reduce((sum, c) => sum + c, 0) / confidences.length,
    });

    currentGroup = [];
  }

  for (const word of words) {
    const wordSourceId = word.sourceId;

    // Flush if source changes
    if (currentSourceId !== null && wordSourceId !== currentSourceId) {
      flushGroup();
    }

    currentSourceId = wordSourceId;
    currentGroup.push(word);

    // Flush if we hit a sentence boundary or max group size
    if (
      SENTENCE_ENDINGS.test(word.word) ||
      currentGroup.length >= maxWordsPerGroup
    ) {
      flushGroup();
    }
  }

  flushGroup();
  return groups;
}
