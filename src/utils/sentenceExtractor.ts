import type { Word, SegmentGroup, Sentence } from "../types";

/**
 * Extract sentences from segment groups.
 * Sentences are detected by splitting on punctuation [.!?]
 * Each sentence becomes a first-class reorderable unit.
 */
export function extractSentences(
  segmentGroups: SegmentGroup[],
  words: Word[]
): Sentence[] {
  const sentences: Sentence[] = [];
  let sentenceIndex = 0;

  // Build word lookup map
  const wordMap = new Map(words.map((w) => [w.id, w]));

  for (const group of segmentGroups) {
    // Get words for this group in order
    const groupWords = group.segmentIds
      .map((id) => wordMap.get(id))
      .filter((w): w is Word => w !== undefined);

    if (groupWords.length === 0) {
      // Create a fallback sentence for groups with no words
      sentences.push({
        sentenceId: `sentence-${sentenceIndex++}`,
        sourceId: group.sourceId,
        wordIds: [],
        text: group.text,
        startTime: group.startTime,
        endTime: group.endTime,
        originalGroupId: group.groupId,
      });
      continue;
    }

    let currentWordIds: string[] = [];
    let currentWordTexts: string[] = [];
    let sentenceStartTime: number | null = null;
    let sentenceEndTime: number = 0;

    for (const word of groupWords) {
      if (sentenceStartTime === null) {
        sentenceStartTime = word.start;
      }

      currentWordIds.push(word.id);
      currentWordTexts.push(word.word);
      sentenceEndTime = word.end;

      // Check if this word ends a sentence
      if (/[.!?]$/.test(word.word.trim())) {
        sentences.push({
          sentenceId: `sentence-${sentenceIndex++}`,
          sourceId: group.sourceId,
          wordIds: currentWordIds,
          text: currentWordTexts.join(" "),
          startTime: sentenceStartTime,
          endTime: sentenceEndTime,
          originalGroupId: group.groupId,
        });

        // Reset for next sentence
        currentWordIds = [];
        currentWordTexts = [];
        sentenceStartTime = null;
      }
    }

    // Add any remaining words as final sentence
    if (currentWordIds.length > 0 && sentenceStartTime !== null) {
      sentences.push({
        sentenceId: `sentence-${sentenceIndex++}`,
        sourceId: group.sourceId,
        wordIds: currentWordIds,
        text: currentWordTexts.join(" "),
        startTime: sentenceStartTime,
        endTime: sentenceEndTime,
        originalGroupId: group.groupId,
      });
    }
  }

  return sentences;
}
