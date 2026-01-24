import type { Segment, SegmentGroup } from "../types";

/**
 * Groups all segments from a source into a single SegmentGroup.
 * Each clip becomes one segment by default.
 */
export function groupSegments(segments: Segment[], sourceId: string): SegmentGroup[] {
  const textSegments = segments.filter((s) => s.text);

  if (textSegments.length === 0) {
    return [];
  }

  const segmentIds = textSegments.map((s) => s.id);
  const words = textSegments.map((s) => s.text!.word);
  const startTime = textSegments[0].text!.start;
  const endTime = textSegments[textSegments.length - 1].text!.end;
  const totalConfidence = textSegments.reduce((sum, s) => sum + s.text!.confidence, 0);

  return [
    {
      groupId: `group-0`,
      sourceId,
      segmentIds,
      text: words.join(" "),
      startTime,
      endTime,
      avgConfidence: totalConfidence / textSegments.length,
    },
  ];
}