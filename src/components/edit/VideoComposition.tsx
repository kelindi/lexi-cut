import { AbsoluteFill, Video, Audio, prefetch } from "remotion";
import {
  TransitionSeries,
  linearTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { useEffect } from "react";
import type { Segment } from "../../types";
import { FPS } from "../../stores/usePlaybackStore";

// Subtle cross-fade duration in frames (~0.17 seconds at 30fps)
const TRANSITION_FRAMES = 5;

interface VideoCompositionProps {
  segments: Segment[];
  videoUrls?: Record<string, string>;
}

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  segments,
  videoUrls,
}) => {
  // Prefetch all video sources for smoother playback
  useEffect(() => {
    if (!videoUrls) return;

    const handles: Array<{ free: () => void }> = [];
    for (const url of Object.values(videoUrls)) {
      if (url) {
        const handle = prefetch(url, { method: "blob-url" });
        handles.push(handle);
      }
    }

    return () => {
      handles.forEach((h) => h.free());
    };
  }, [videoUrls]);

  if (segments.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <div style={{ color: "#666", textAlign: "center", marginTop: "50%" }}>
          No segments
        </div>
      </AbsoluteFill>
    );
  }

  // Premount frames before each transition for seamless playback
  const PREMOUNT_FRAMES = FPS * 2; // 2 seconds premount

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <TransitionSeries>
        {segments.flatMap((seg, index) => {
          // Check if this segment has a separate audio source (B-roll case)
          const hasSeparateAudio = !!seg.audioSourceId;

          const sequenceElement = (
            <TransitionSeries.Sequence
              key={seg.sentenceIds.join("-")}
              durationInFrames={seg.durationFrames}
              premountFor={PREMOUNT_FRAMES}
            >
              <AbsoluteFill>
                {hasSeparateAudio ? (
                  // B-roll: Muted video + separate audio from original source
                  <>
                    <Video
                      src={videoUrls?.[seg.sourcePath] || ""}
                      startFrom={Math.round(seg.sourceStart * FPS)}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      pauseWhenBuffering
                      muted
                    />
                    <Audio
                      src={videoUrls?.[seg.audioSourcePath!] || ""}
                      startFrom={Math.round((seg.audioStart ?? 0) * FPS)}
                      pauseWhenBuffering
                    />
                  </>
                ) : (
                  // Normal: Video with its own audio
                  <Video
                    src={videoUrls?.[seg.sourcePath] || ""}
                    startFrom={Math.round(seg.sourceStart * FPS)}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    pauseWhenBuffering
                  />
                )}
              </AbsoluteFill>
            </TransitionSeries.Sequence>
          );

          // Add transition before this sequence (except for the first one)
          if (index > 0) {
            return [
              <TransitionSeries.Transition
                key={`transition-${index}`}
                presentation={fade()}
                timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
              />,
              sequenceElement,
            ];
          }

          return [sequenceElement];
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export function calculateTotalFrames(segments: Segment[]): number {
  if (segments.length === 0) return 1;
  // Sum all segment durations
  const totalSegmentFrames = segments.reduce((sum, seg) => sum + seg.durationFrames, 0);
  // Subtract transition overlaps (one transition between each pair of segments)
  const transitionCount = Math.max(0, segments.length - 1);
  return totalSegmentFrames - (transitionCount * TRANSITION_FRAMES);
}
