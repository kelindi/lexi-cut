import { Composition, getInputProps } from "remotion";
import { VideoComposition, calculateTotalFrames } from "../components/edit/VideoComposition";
import { FPS } from "../stores/usePlaybackStore";
import type { Segment } from "../types";

// This is the Remotion entry point for rendering
// It registers the composition that can be rendered via CLI or programmatically

interface RenderInputProps {
  segments: Segment[];
  videoUrls: Record<string, string>;
  width?: number;
  height?: number;
}

export const RemotionVideo: React.FC = () => {
  const inputProps = getInputProps() as RenderInputProps;
  const { width = 1920, height = 1080 } = inputProps;

  return (
    <>
      <Composition
        id="VideoExport"
        component={VideoComposition}
        durationInFrames={300}
        fps={FPS}
        width={width}
        height={height}
        defaultProps={{
          segments: [],
          videoUrls: {},
        }}
        calculateMetadata={async ({ props }) => {
          const totalFrames = calculateTotalFrames(props.segments);
          return {
            durationInFrames: Math.max(1, totalFrames),
          };
        }}
      />
    </>
  );
};
