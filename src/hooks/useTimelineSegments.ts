import { useMemo } from "react";
import { useProjectStore } from "../stores/useProjectStore";
import { useSourcesStore } from "../stores/useSourcesStore";
import { secondsToFrames } from "../stores/usePlaybackStore";
import type { Segment } from "../types";

/**
 * Computes timeline segments with MINIMAL breaks for smooth playback.
 *
 * Philosophy: Only create segment boundaries when absolutely necessary.
 * - Unedited content from same source = ONE segment
 * - Only break when: word deleted, sentence reordered, or source changes
 *
 * This minimizes Remotion <Sequence> elements and avoids seeking jitter.
 */
export function useTimelineSegments(): Segment[] {
  const timeline = useProjectStore((s) => s.timeline);
  const sentences = useProjectStore((s) => s.sentences);
  const words = useProjectStore((s) => s.words);
  const sources = useSourcesStore((s) => s.sources);

  return useMemo(() => {
    const sourceMap = new Map(sources.map((s) => [s.id, s]));
    const sentenceMap = new Map(sentences.map((s) => [s.sentenceId, s]));
    const wordMap = new Map(words.map((w) => [w.id, w]));

    // First pass: Build time ranges from timeline entries
    // Use sentence-level timing when possible, only go word-level when words are excluded
    const timeRanges: Array<{
      sentenceId: string;
      sourceId: string;
      sourcePath: string;
      start: number;
      end: number;
      text: string;
      hasWordDeletions: boolean; // True if this range came from a sentence with deleted words
    }> = [];

    for (const entry of timeline.entries) {
      // Skip excluded sentences entirely
      if (entry.excluded) continue;

      const sentence = sentenceMap.get(entry.sentenceId);
      if (!sentence) continue;

      const effectiveSourceId = entry.videoOverride?.sourceId ?? entry.sourceId;
      const source = sourceMap.get(effectiveSourceId);
      if (!source) continue;

      const excludedWordIds = new Set(entry.excludedWordIds);
      const hasExcludedWords = excludedWordIds.size > 0;

      // No words excluded OR no word data → use sentence timing directly (ONE range)
      if (!hasExcludedWords || sentence.wordIds.length === 0) {
        const start = entry.videoOverride?.start ?? sentence.startTime;
        const end = entry.videoOverride?.end ?? sentence.endTime;

        timeRanges.push({
          sentenceId: entry.sentenceId,
          sourceId: effectiveSourceId,
          sourcePath: source.path,
          start,
          end,
          text: entry.text,
          hasWordDeletions: false,
        });
        continue;
      }

      // Words are excluded - build ranges from consecutive included words
      let rangeStart: number | null = null;
      let rangeEnd: number | null = null;
      let rangeText: string[] = [];

      for (const wordId of sentence.wordIds) {
        const word = wordMap.get(wordId);
        if (!word) continue;

        if (excludedWordIds.has(wordId)) {
          // Word excluded - close current range if open
          if (rangeStart !== null && rangeEnd !== null) {
            timeRanges.push({
              sentenceId: entry.sentenceId,
              sourceId: effectiveSourceId,
              sourcePath: source.path,
              start: rangeStart,
              end: rangeEnd,
              text: rangeText.join(" "),
              hasWordDeletions: true, // Mark that this came from a sentence with deletions
            });
            rangeStart = null;
            rangeEnd = null;
            rangeText = [];
          }
        } else {
          // Word included - extend or start range
          if (rangeStart === null) {
            rangeStart = word.start;
          }
          rangeEnd = word.end;
          rangeText.push(word.word);
        }
      }

      // Close final range
      if (rangeStart !== null && rangeEnd !== null) {
        timeRanges.push({
          sentenceId: entry.sentenceId,
          sourceId: effectiveSourceId,
          sourcePath: source.path,
          start: rangeStart,
          end: rangeEnd,
          text: rangeText.join(" "),
          hasWordDeletions: true, // Mark that this came from a sentence with deletions
        });
      }
    }

    // Second pass: Merge adjacent ranges that are in forward order in source time
    // Only create segment breaks when there's an actual discontinuity (reorder, deletion, source change)
    const segments: Segment[] = [];
    let segmentIndex = 0;
    let lastRangeHadDeletions = false;

    for (const range of timeRanges) {
      const lastSeg = segments[segments.length - 1];
      const gap = lastSeg ? range.start - lastSeg.sourceEnd : 0;

      // Determine merge threshold based on whether there are word deletions
      // - For ranges from sentences with deletions: only merge if truly adjacent (<100ms)
      //   This ensures deleted word gaps create segment breaks
      // - For clean ranges: allow natural speech pauses (up to 10s) to play through
      const hasAnyDeletions = range.hasWordDeletions || lastRangeHadDeletions;
      const mergeThreshold = hasAnyDeletions ? 0.1 : 10.0;

      // Can merge if:
      // 1. Same source
      // 2. This range starts AT or AFTER where the last segment ends (forward in source time)
      // 3. Gap is within threshold (tight for deletions, loose for natural pauses)
      const canMerge =
        lastSeg &&
        lastSeg.sourceId === range.sourceId &&
        range.start >= lastSeg.sourceEnd - 0.05 && // Starts after (allow tiny overlap)
        gap < mergeThreshold;

      if (canMerge) {
        // Extend existing segment
        lastSeg.sourceEnd = range.end;
        lastSeg.durationFrames = secondsToFrames(lastSeg.sourceEnd - lastSeg.sourceStart);
        lastSeg.text += " " + range.text;
        if (!lastSeg.sentenceIds.includes(range.sentenceId)) {
          lastSeg.sentenceIds.push(range.sentenceId);
        }
      } else {
        // Create new segment (discontinuity in source time)
        const currentFrame =
          segments.length > 0
            ? segments[segments.length - 1].startFrame +
              segments[segments.length - 1].durationFrames
            : 0;

        const durationFrames = secondsToFrames(range.end - range.start);

        segments.push({
          id: `segment-${segmentIndex++}`,
          sentenceIds: [range.sentenceId],
          sourceId: range.sourceId,
          sourcePath: range.sourcePath,
          sourceStart: range.start,
          sourceEnd: range.end,
          startFrame: currentFrame,
          durationFrames,
          text: range.text,
        });
      }

      // Track for next iteration
      lastRangeHadDeletions = range.hasWordDeletions;
    }

    return segments;
  }, [timeline, sentences, words, sources]);
}

/**
 * Computes total duration in frames from timeline segments
 */
export function useTotalDuration(): number {
  const segments = useTimelineSegments();
  return useMemo(() => {
    if (segments.length === 0) return 1; // Minimum 1 frame
    const last = segments[segments.length - 1];
    return last.startFrame + last.durationFrames;
  }, [segments]);
}

/**
 * Find which segment contains a given frame
 */
export function useSegmentAtFrame(frame: number): Segment | null {
  const segments = useTimelineSegments();
  return useMemo(() => {
    for (const seg of segments) {
      if (frame >= seg.startFrame && frame < seg.startFrame + seg.durationFrames) {
        return seg;
      }
    }
    return null;
  }, [segments, frame]);
}
