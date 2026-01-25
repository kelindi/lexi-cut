import { useMemo } from "react";
import { useProjectStore } from "../stores/useProjectStore";
import { useSourcesStore } from "../stores/useSourcesStore";
import { secondsToFrames } from "../stores/usePlaybackStore";
import type { Segment } from "../types";

/**
 * Computes timeline segments at the WORD level using the Timeline structure.
 *
 * - Iterates through timeline entries in order
 * - For each entry, processes individual words
 * - Skips excluded entries AND excluded words (from entry.excludedWordIds)
 * - Merges adjacent words into continuous video segments
 * - Creates cuts when words are excluded or reordered
 * - Supports videoOverride for future B-roll
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

    // First pass: collect all included words with their timing
    const includedWords: Array<{
      sentenceId: string;
      sourceId: string;
      sourcePath: string;
      start: number;
      end: number;
      text: string;
    }> = [];

    for (const entry of timeline.entries) {
      // Skip excluded sentences
      if (entry.excluded) continue;

      const sentence = sentenceMap.get(entry.sentenceId);
      if (!sentence) continue;

      // Determine source: use videoOverride if present, else sentence's source
      const effectiveSourceId = entry.videoOverride?.sourceId ?? entry.sourceId;
      const source = sourceMap.get(effectiveSourceId);
      if (!source) continue;

      // Build excluded words set for this entry
      const entryExcludedWords = new Set(entry.excludedWordIds);

      // Handle transcriptless sentences (no words) - use sentence times directly
      if (sentence.wordIds.length === 0) {
        // For videoOverride, use override times
        const start = entry.videoOverride?.start ?? sentence.startTime;
        const end = entry.videoOverride?.end ?? sentence.endTime;

        includedWords.push({
          sentenceId: entry.sentenceId,
          sourceId: effectiveSourceId,
          sourcePath: source.path,
          start,
          end,
          text: entry.text,
        });
        continue;
      }

      for (const wordId of sentence.wordIds) {
        // Skip excluded words
        if (entryExcludedWords.has(wordId)) continue;

        const word = wordMap.get(wordId);
        if (!word) continue;

        includedWords.push({
          sentenceId: entry.sentenceId,
          sourceId: effectiveSourceId,
          sourcePath: source.path,
          start: word.start,
          end: word.end,
          text: word.word,
        });
      }
    }

    // Second pass: merge consecutive words from same source
    // Only merge if words are truly adjacent (no excluded words between them)
    const segments: Segment[] = [];
    const ADJACENCY_TOLERANCE = 0.1; // 100ms
    let segmentIndex = 0;

    for (let i = 0; i < includedWords.length; i++) {
      const word = includedWords[i];
      const lastSeg = segments[segments.length - 1];
      const prevWord = i > 0 ? includedWords[i - 1] : null;

      // Can merge if:
      // 1. Same source as previous segment
      // 2. This word immediately follows the previous word (in timeline order)
      // 3. The words are temporally adjacent in the source
      const canMerge =
        lastSeg &&
        prevWord &&
        lastSeg.sourceId === word.sourceId &&
        Math.abs(word.start - prevWord.end) < ADJACENCY_TOLERANCE;

      if (canMerge) {
        lastSeg.sourceEnd = word.end;
        lastSeg.durationFrames = secondsToFrames(lastSeg.sourceEnd - lastSeg.sourceStart);
        lastSeg.text += " " + word.text;
        if (!lastSeg.sentenceIds.includes(word.sentenceId)) {
          lastSeg.sentenceIds.push(word.sentenceId);
        }
      } else {
        const currentFrame =
          segments.length > 0
            ? segments[segments.length - 1].startFrame +
              segments[segments.length - 1].durationFrames
            : 0;

        const durationFrames = secondsToFrames(word.end - word.start);

        segments.push({
          id: `segment-${segmentIndex++}`,
          sentenceIds: [word.sentenceId],
          sourceId: word.sourceId,
          sourcePath: word.sourcePath,
          sourceStart: word.start,
          sourceEnd: word.end,
          startFrame: currentFrame,
          durationFrames,
          text: word.text,
        });
      }
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
