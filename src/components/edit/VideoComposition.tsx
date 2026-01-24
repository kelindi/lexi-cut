import { AbsoluteFill, Sequence, Video, prefetch } from "remotion";
import { useEffect } from "react";
import type { Segment } from "../../types";
import { FPS } from "../../stores/usePlaybackStore";

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
      {segments.map((seg, index) => {
        // Ensure segments are contiguous - use previous segment's end frame
        const startFrame = index === 0
          ? 0
          : segments[index - 1].startFrame + segments[index - 1].durationFrames;

        return (
          <Sequence
            key={seg.sentenceIds.join("-")}
            from={startFrame}
            durationInFrames={seg.durationFrames}
            premountFor={PREMOUNT_FRAMES}
          >
            <Video
              src={videoUrls?.[seg.sourcePath] || ""}
              startFrom={Math.round(seg.sourceStart * FPS)}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              pauseWhenBuffering
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export function calculateTotalFrames(segments: Segment[]): number {
  if (segments.length === 0) return 1;
  const last = segments[segments.length - 1];
  return last.startFrame + last.durationFrames;
}
