import { AbsoluteFill, Sequence } from "remotion";
import { SyncedVideo } from "./SyncedVideo";
import type { TimelineSegment } from "../../types";

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
          <SyncedVideo
            src={videoUrls?.[seg.sourcePath] || ""}
            startFrom={seg.sourceStart}
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
