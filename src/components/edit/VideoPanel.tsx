import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { VideoComposition, calculateTotalFrames } from "./VideoComposition";
import { PlaybackControls } from "./PlaybackControls";
import { usePlaybackStore, FPS } from "../../stores/usePlaybackStore";
import { useTimelineSegments } from "../../hooks/useTimelineSegments";
import { getVideoUrl } from "../../lib/assetUrl";

export function VideoPanel() {
  const playerRef = useRef<PlayerRef>(null);
  const segments = useTimelineSegments();
  const totalFrames = calculateTotalFrames(segments);

  // Build video URLs synchronously using asset protocol
  const videoUrls = useMemo(() => {
    const urls: Record<string, string> = {};
    for (const seg of segments) {
      if (!urls[seg.sourcePath]) {
        urls[seg.sourcePath] = getVideoUrl(seg.sourcePath);
      }
    }
    return urls;
  }, [segments]);

  // Only subscribe to what we need - NOT currentFrame (causes 30fps re-renders)
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const seekRequest = usePlaybackStore((s) => s.seekRequest);
  const setCurrentFrame = usePlaybackStore((s) => s.setCurrentFrame);
  const setDurationInFrames = usePlaybackStore((s) => s.setDurationInFrames);
  const clearSeekRequest = usePlaybackStore((s) => s.clearSeekRequest);
  const play = usePlaybackStore((s) => s.play);
  const pause = usePlaybackStore((s) => s.pause);

  // Update duration when segments change
  useEffect(() => {
    setDurationInFrames(totalFrames);
  }, [totalFrames, setDurationInFrames]);

  // Track player instance for effects
  const [playerReady, setPlayerReady] = useState(0);

  const playerRefCallback = useCallback((player: PlayerRef | null) => {
    (playerRef as React.MutableRefObject<PlayerRef | null>).current = player;
    if (player) {
      // Trigger effects to re-run when player mounts
      setPlayerReady((n) => n + 1);
    }
  }, []);

  // Sync player state with store
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [isPlaying, playerReady]);

  // Handle external seek requests
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !seekRequest) return;

    player.seekTo(seekRequest.frame);
    clearSeekRequest();
  }, [seekRequest, clearSeekRequest, playerReady]);

  // Listen to frame updates from the player and sync back to store
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const handleFrameUpdate = (e: { detail: { frame: number } }) => {
      setCurrentFrame(e.detail.frame);
    };

    player.addEventListener("frameupdate", handleFrameUpdate);
    return () => {
      player.removeEventListener("frameupdate", handleFrameUpdate);
    };
  }, [setCurrentFrame, playerReady]);

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
    [setCurrentFrame],
  );

  // Memoize inputProps to prevent unnecessary Player re-renders
  const inputProps = useMemo(
    () => ({ segments, videoUrls }),
    [segments, videoUrls],
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
      <div className="flex flex-1 min-h-0 items-center justify-center bg-black p-1">
        <div
          className="relative"
          style={{
            aspectRatio: "9/16",
            height: "100%",
            maxHeight: "100%",
          }}
        >
          <Player
            ref={playerRefCallback}
            component={VideoComposition}
            inputProps={inputProps}
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
        totalFrames={totalFrames}
        onPlay={handlePlay}
        onPause={handlePause}
        onSeek={handleSeek}
      />
    </div>
  );
}
