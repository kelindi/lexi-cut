import { useRef, useEffect, useCallback, useMemo } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { VideoComposition, calculateTotalFrames } from "./VideoComposition";
import { PlaybackControls } from "./PlaybackControls";
import { usePlaybackStore, FPS } from "../../stores/usePlaybackStore";
import { useTimelineSegments } from "../../hooks/useTimelineSegments";
import { useVideoUrls } from "../../hooks/useVideoUrl";

export function VideoPanel() {
  const playerRef = useRef<PlayerRef>(null);
  const segments = useTimelineSegments();
  const totalFrames = calculateTotalFrames(segments);

  // Extract unique source paths for preloading
  const sourcePaths = useMemo(() => {
    return [...new Set(segments.map((seg) => seg.sourcePath))];
  }, [segments]);

  // Preload videos as blob URLs
  const { urls: videoUrls, isLoading: videosLoading } = useVideoUrls(sourcePaths);

  const {
    isPlaying,
    currentFrame,
    setCurrentFrame,
    setDurationInFrames,
    play,
    pause,
  } = usePlaybackStore();

  // Update duration when segments change
  useEffect(() => {
    setDurationInFrames(totalFrames);
  }, [totalFrames, setDurationInFrames]);

  // Sync player state with store
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [isPlaying]);

  // Seek to frame when currentFrame changes externally
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(currentFrame);
  }, [currentFrame]);

  const handlePlay = useCallback(() => {
    play();
  }, [play]);

  const handlePause = useCallback(() => {
    pause();
  }, [pause]);

  const handleSeek = useCallback(
    (frame: number) => {
      playerRef.current?.seekTo(frame);
      setCurrentFrame(frame);
    },
    [setCurrentFrame]
  );

  if (segments.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        No segments to preview
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Video player container - constrained height */}
      <div className="flex flex-1 min-h-0 items-center justify-center bg-black p-2">
        <div
          className="relative"
          style={{
            aspectRatio: "9/16",
            height: "100%",
            maxHeight: "100%",
          }}
        >
          {videosLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 z-10">
              <div className="text-neutral-500 text-sm">Loading...</div>
            </div>
          )}
          <Player
            ref={playerRef}
            component={VideoComposition}
            inputProps={{ segments, videoUrls }}
            durationInFrames={totalFrames}
            fps={FPS}
            compositionWidth={1080}
            compositionHeight={1920}
            style={{
              width: "100%",
              height: "100%",
            }}
            controls={false}
            showVolumeControls={false}
            clickToPlay={false}
            loop={false}
            spaceKeyToPlayOrPause={false}
          />
        </div>
      </div>

      {/* Playback controls */}
      <PlaybackControls
        isPlaying={isPlaying}
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        onPlay={handlePlay}
        onPause={handlePause}
        onSeek={handleSeek}
      />
    </div>
  );
}
