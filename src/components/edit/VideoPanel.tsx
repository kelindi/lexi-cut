import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { VideoComposition, calculateTotalFrames } from "./VideoComposition";
import { PlaybackControls } from "./PlaybackControls";
import { usePlaybackStore, FPS } from "../../stores/usePlaybackStore";
import { useTimelineSegments } from "../../hooks/useTimelineSegments";
import { useSourcesStore } from "../../stores/useSourcesStore";
import { getVideoUrl } from "../../lib/assetUrl";

export function VideoPanel() {
  const playerRef = useRef<PlayerRef>(null);
  const segments = useTimelineSegments();
  const sources = useSourcesStore((s) => s.sources);
  const updateSourceDimensions = useSourcesStore((s) => s.updateSourceDimensions);
  const totalFrames = calculateTotalFrames(segments);

  // State for detected dimensions when sources don't have them
  const [detectedDimensions, setDetectedDimensions] = useState<{ width: number; height: number } | null>(null);

  // Check if sources have dimensions
  const sourceDimensions = useMemo(() => {
    const sourceWithDims = sources.find((s) => s.width && s.height);
    if (sourceWithDims?.width && sourceWithDims?.height) {
      return { width: sourceWithDims.width, height: sourceWithDims.height };
    }
    return null;
  }, [sources]);

  // Detect dimensions from video metadata if sources don't have them
  useEffect(() => {
    if (sourceDimensions || segments.length === 0) return;

    const firstSegment = segments[0];
    const videoUrl = getVideoUrl(firstSegment.sourcePath);

    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      const { videoWidth, videoHeight } = video;
      setDetectedDimensions({ width: videoWidth, height: videoHeight });
      // Persist to store so we don't need to detect again
      updateSourceDimensions(firstSegment.sourcePath, videoWidth, videoHeight);
    };

    video.onerror = null;

    video.src = videoUrl;

    return () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.src = '';
    };
  }, [sourceDimensions, segments, updateSourceDimensions]);

  // Use source dimensions, detected dimensions, or fallback to 16:9
  const { compositionWidth, compositionHeight } = useMemo(() => {
    if (sourceDimensions) {
      return { compositionWidth: sourceDimensions.width, compositionHeight: sourceDimensions.height };
    }
    if (detectedDimensions) {
      return { compositionWidth: detectedDimensions.width, compositionHeight: detectedDimensions.height };
    }
    // Default to landscape (16:9)
    return { compositionWidth: 1920, compositionHeight: 1080 };
  }, [sourceDimensions, detectedDimensions]);

  // Determine if video is portrait or landscape for CSS sizing strategy
  const isPortrait = compositionHeight > compositionWidth;


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

  const handleSkipBack = useCallback(() => {
    const current = playerRef.current?.getCurrentFrame() ?? 0;
    const newFrame = Math.max(0, current - FPS * 5);
    playerRef.current?.seekTo(newFrame);
    setCurrentFrame(newFrame);
  }, [setCurrentFrame]);

  const handleSkipForward = useCallback(() => {
    const current = playerRef.current?.getCurrentFrame() ?? 0;
    const newFrame = Math.min(totalFrames - 1, current + FPS * 5);
    playerRef.current?.seekTo(newFrame);
    setCurrentFrame(newFrame);
  }, [totalFrames, setCurrentFrame]);

  const handleStepBack = useCallback(() => {
    const current = playerRef.current?.getCurrentFrame() ?? 0;
    const newFrame = Math.max(0, current - 1);
    playerRef.current?.seekTo(newFrame);
    setCurrentFrame(newFrame);
  }, [setCurrentFrame]);

  const handleStepForward = useCallback(() => {
    const current = playerRef.current?.getCurrentFrame() ?? 0;
    const newFrame = Math.min(totalFrames - 1, current + 1);
    playerRef.current?.seekTo(newFrame);
    setCurrentFrame(newFrame);
  }, [totalFrames, setCurrentFrame]);

  const handleJumpStart = useCallback(() => {
    playerRef.current?.seekTo(0);
    setCurrentFrame(0);
  }, [setCurrentFrame]);

  const handleJumpEnd = useCallback(() => {
    const endFrame = Math.max(0, totalFrames - 1);
    playerRef.current?.seekTo(endFrame);
    setCurrentFrame(endFrame);
  }, [totalFrames, setCurrentFrame]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault(); // Prevent page scroll
          if (isPlaying) {
            pause();
          } else {
            play();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleSkipBack();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleSkipForward();
          break;
        case "Comma":
          e.preventDefault();
          handleStepBack();
          break;
        case "Period":
          e.preventDefault();
          handleStepForward();
          break;
        case "Home":
          e.preventDefault();
          handleJumpStart();
          break;
        case "End":
          e.preventDefault();
          handleJumpEnd();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, play, pause, handleSkipBack, handleSkipForward, handleStepBack, handleStepForward, handleJumpStart, handleJumpEnd]);

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
      {/* Video player container - absolute positioning ensures proper dimensions */}
      <div
        className="relative flex-1 min-h-0"
        style={{
          backgroundColor: '#111111',
          backgroundImage: `
            radial-gradient(circle, #333333 1px, transparent 1px),
            radial-gradient(circle, #333333 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 10px 10px',
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <div
            className="relative overflow-hidden rounded-lg"
            style={{
              aspectRatio: `${compositionWidth} / ${compositionHeight}`,
              maxWidth: '100%',
              maxHeight: '100%',
              // For portrait: prioritize height. For landscape: prioritize width
              width: isPortrait ? 'auto' : '100%',
              height: isPortrait ? '100%' : 'auto',
              // Layered shadows create soft blend from video edge into dot grid background
              boxShadow: '0 0 30px 10px rgba(17,17,17,0.8), 0 0 60px 20px rgba(17,17,17,0.6), 0 0 100px 40px rgba(17,17,17,0.4)',
            }}
          >
            <Player
              ref={playerRefCallback}
              component={VideoComposition}
              inputProps={inputProps}
              durationInFrames={totalFrames}
              fps={FPS}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
              style={{
                width: "100%",
                height: "100%",
              }}
              controls={false}
              showVolumeControls={false}
              clickToPlay={false}
              loop={false}
              spaceKeyToPlayOrPause={true}
              bufferStateDelayInMilliseconds={500}
              hideControlsWhenPointerDoesntMove={false}
              renderLoading={() => (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "#000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#666",
                }}>
                  Loading...
                </div>
              )}
            />
          </div>
        </div>
      </div>

      {/* Playback controls */}
      <PlaybackControls
        isPlaying={isPlaying}
        totalFrames={totalFrames}
        onPlay={handlePlay}
        onPause={handlePause}
        onSeek={handleSeek}
        onSkipBack={handleSkipBack}
        onSkipForward={handleSkipForward}
        onStepBack={handleStepBack}
        onStepForward={handleStepForward}
        onJumpStart={handleJumpStart}
        onJumpEnd={handleJumpEnd}
      />
    </div>
  );
}
