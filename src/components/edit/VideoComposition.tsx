import { AbsoluteFill, Sequence, Video } from "remotion";
import type { TimelineSegment } from "../../types";
import { FPS } from "../../stores/usePlaybackStore";

interface VideoCompositionProps {
  segments: TimelineSegment[];
  videoUrls?: Record<string, string>;
}

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  segments,
  videoUrls,
}) => {
  if (segments.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <div style={{ color: "#666", textAlign: "center", marginTop: "50%" }}>
          No segments
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {segments.map((seg) => (
        <Sequence
          key={seg.groupId}
          from={seg.startFrame}
          durationInFrames={seg.durationFrames}
        >
          <Video
            src={videoUrls?.[seg.sourcePath] || ""}
            startFrom={Math.round(seg.sourceStart * FPS)}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            pauseWhenBuffering
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export function calculateTotalFrames(segments: TimelineSegment[]): number {
  if (segments.length === 0) return 1;
  const last = segments[segments.length - 1];
  return last.startFrame + last.durationFrames;
}
