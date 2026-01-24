import { useRef, useEffect, useState } from "react";
import { useCurrentFrame, useVideoConfig, AbsoluteFill } from "remotion";

interface SyncedVideoProps {
  src: string;
  startFrom?: number; // Start time in seconds
  style?: React.CSSProperties;
}

export const SyncedVideo: React.FC<SyncedVideoProps> = ({
  src,
  startFrom = 0,
  style,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastFrameRef = useRef<number>(-1);
  const isPlayingRef = useRef<boolean>(false);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [isReady, setIsReady] = useState(false);

  // Detect if we're playing (frames advancing by 1) or scrubbing (frames jumping)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !isReady) return;

    const targetTime = startFrom + frame / fps;
    const frameDelta = frame - lastFrameRef.current;
    const isPlaying = frameDelta === 1;

    lastFrameRef.current = frame;

    if (isPlaying) {
      // Playing: let video play naturally, only correct if drifted too far
      if (!isPlayingRef.current) {
        // Just started playing
        video.currentTime = targetTime;
        video.play().catch(() => {}); // Ignore autoplay errors
        isPlayingRef.current = true;
      } else {
        // Already playing - check drift
        const drift = Math.abs(video.currentTime - targetTime);
        if (drift > 0.15) {
          // Too far off, resync
          video.currentTime = targetTime;
        }
      }
    } else {
      // Paused or scrubbing: pause video and seek
      if (isPlayingRef.current || video.paused === false) {
        video.pause();
        isPlayingRef.current = false;
      }

      // Seek to target (but not too frequently)
      const drift = Math.abs(video.currentTime - targetTime);
      if (drift > 0.03) {
        video.currentTime = targetTime;
      }
    }
  }, [frame, fps, startFrom, src, isReady]);

  // Pause video when component unmounts or src changes
  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (video) {
        video.pause();
        isPlayingRef.current = false;
      }
    };
  }, [src]);

  if (!src) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <div style={{ color: "#666", textAlign: "center", marginTop: "50%" }}>
          No video source
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <video
        ref={videoRef}
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          ...style,
        }}
        playsInline
        preload="auto"
        onLoadedData={() => setIsReady(true)}
        onError={(e) => console.error("[SyncedVideo] Error:", e)}
      />
    </AbsoluteFill>
  );
};
