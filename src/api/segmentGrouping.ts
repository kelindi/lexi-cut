import type { Word, SegmentGroup } from "../types";

/**
 * Groups all words from a source into a single SegmentGroup.
 * Each clip becomes one group by default.
 * Note: SegmentGroup.segmentIds still holds word IDs (legacy naming).
 */
export function groupWords(words: Word[], sourceId: string): SegmentGroup[] {
  if (words.length === 0) {
    return [];
  }

  const wordIds = words.map((w) => w.id);
  const wordTexts = words.map((w) => w.word);
  const startTime = words[0].start;
  const endTime = words[words.length - 1].end;
  const totalConfidence = words.reduce((sum, w) => sum + w.confidence, 0);

  return [
    {
      groupId: `group-0`,
      sourceId,
      segmentIds: wordIds,  // Note: these are word IDs (legacy field name)
      text: wordTexts.join(" "),
      startTime,
      endTime,
      avgConfidence: totalConfidence / words.length,
    },
  ];
}