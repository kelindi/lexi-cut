import { useMemo } from "react";
import { useProjectStore } from "../stores/useProjectStore";
import { useSourcesStore } from "../stores/useSourcesStore";
import { secondsToFrames } from "../stores/usePlaybackStore";
import type { TimelineSegment } from "../types";

/**
 * Computes timeline segments from active (non-excluded) segment groups
 * Each segment includes frame positions for Remotion and source paths for video loading
 */
export function useTimelineSegments(): TimelineSegment[] {
  const orderedGroupIds = useProjectStore((s) => s.orderedGroupIds);
  const excludedGroupIds = useProjectStore((s) => s.excludedGroupIds);
  const segmentGroups = useProjectStore((s) => s.segmentGroups);
  const sources = useSourcesStore((s) => s.sources);

  return useMemo(() => {
    const excluded = new Set(excludedGroupIds);
    const sourceMap = new Map(sources.map((s) => [s.id, s]));

    let currentFrame = 0;
    const segments: TimelineSegment[] = [];

    for (const groupId of orderedGroupIds) {
      if (excluded.has(groupId)) continue;

      const group = segmentGroups.find((g) => g.groupId === groupId);
      if (!group) continue;

      const source = sourceMap.get(group.sourceId);
      if (!source) continue;

      const durationSeconds = group.endTime - group.startTime;
      const durationFrames = secondsToFrames(durationSeconds);

      segments.push({
        groupId: group.groupId,
        sourceId: group.sourceId,
        sourcePath: source.path,
        sourceStart: group.startTime,
        sourceEnd: group.endTime,
        startFrame: currentFrame,
        durationFrames,
        text: group.text,
      });

      currentFrame += durationFrames;
    }

    return segments;
  }, [orderedGroupIds, excludedGroupIds, segmentGroups, sources]);
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
export function useSegmentAtFrame(frame: number): TimelineSegment | null {
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
