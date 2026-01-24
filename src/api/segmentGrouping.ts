import type { Segment, SegmentGroup } from "../types";

const MAX_GROUP_DURATION_S = 15;
const MIN_GROUP_DURATION_S = 2;
const SENTENCE_ENDINGS = /[.!?]$/;

export function groupSegments(segments: Segment[], sourceId: string): SegmentGroup[] {
  const groups: SegmentGroup[] = [];
  let currentIds: string[] = [];
  let currentWords: string[] = [];
  let groupStart: number | null = null;
  let confidenceSum = 0;

  function flushGroup(endTime: number) {
    if (currentIds.length === 0 || groupStart === null) return;

    groups.push({
      groupId: `group-${groups.length}`,
      sourceId,
      segmentIds: [...currentIds],
      text: currentWords.join(" "),
      startTime: groupStart,
      endTime,
      avgConfidence: confidenceSum / currentIds.length,
    });

    currentIds = [];
    currentWords = [];
    groupStart = null;
    confidenceSum = 0;
  }

  for (const segment of segments) {
    if (!segment.text) continue;

    const { word, start, end, confidence } = segment.text;

    if (groupStart === null) {
      groupStart = start;
    }

    currentIds.push(segment.id);
    currentWords.push(word);
    confidenceSum += confidence;

    const groupDuration = end - groupStart;

    // Break on sentence-ending punctuation (if group meets minimum duration)
    if (SENTENCE_ENDINGS.test(word) && groupDuration >= MIN_GROUP_DURATION_S) {
      flushGroup(end);
      continue;
    }

    // Break on time cap regardless of punctuation
    if (groupDuration >= MAX_GROUP_DURATION_S) {
      flushGroup(end);
    }
  }

  // Flush remaining segments
  if (currentIds.length > 0) {
    const lastId = currentIds[currentIds.length - 1];
    const lastSegment = segments.find((s) => s.id === lastId);
    const endTime = lastSegment?.text?.end ?? 0;

    // Merge short trailing group into previous if possible
    if (
      groups.length > 0 &&
      groupStart !== null &&
      endTime - groupStart < MIN_GROUP_DURATION_S
    ) {
      const prev = groups[groups.length - 1];
      prev.segmentIds.push(...currentIds);
      prev.text += " " + currentWords.join(" ");
      prev.endTime = endTime;
      prev.avgConfidence =
        (prev.avgConfidence * (prev.segmentIds.length - currentIds.length) + confidenceSum) /
        prev.segmentIds.length;
    } else {
      flushGroup(endTime);
    }
  }

  return groups;
}