import { useRef, useCallback, useEffect, useState } from "react";
import { useTimelineSegments, useTotalDuration } from "../../hooks/useTimelineSegments";
import { usePlaybackStore, framesToSeconds, formatTime } from "../../stores/usePlaybackStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { useThumbnailCache } from "../../hooks/useThumbnailCache";

// Color palette for different source files
const COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#06b6d4", // cyan
];

export function Timeline() {
  const segments = useTimelineSegments();
  const totalFrames = useTotalDuration();
  const currentFrame = usePlaybackStore((s) => s.currentFrame);
  const seekToFrame = usePlaybackStore((s) => s.seekToFrame);
  const selectedSentenceId = useSelectionStore((s) => s.selectedSentenceId);
  const selectSentence = useSelectionStore((s) => s.selectSentence);
  const { getThumbnail } = useThumbnailCache(segments);

  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Build source → color mapping
  const sourceColors = new Map<string, string>();
  let colorIndex = 0;
  for (const seg of segments) {
    if (!sourceColors.has(seg.sourceId)) {
      sourceColors.set(seg.sourceId, COLORS[colorIndex % COLORS.length]);
      colorIndex++;
    }
  }

  const seekFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track || totalFrames <= 0) return;

    const rect = track.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const frame = Math.round(percent * (totalFrames - 1));
    seekToFrame(frame);
  }, [totalFrames, seekToFrame]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    seekFromClientX(e.clientX);
  }, [seekFromClientX]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      seekFromClientX(e.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, seekFromClientX]);

  const handleSegmentClick = (
    e: React.MouseEvent,
    sentenceId: string,
    startFrame: number
  ) => {
    e.stopPropagation();
    selectSentence(sentenceId);
    seekToFrame(startFrame);
  };

  if (segments.length === 0) {
    return null;
  }

  const playheadPosition = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0;
  const totalSeconds = framesToSeconds(totalFrames);

  // Generate time markers at appropriate intervals
  const getTimeMarkers = () => {
    const markers: { time: number; label: string; major: boolean }[] = [];

    // Choose interval based on duration
    let interval: number;
    if (totalSeconds <= 10) {
      interval = 1; // every second for short videos
    } else if (totalSeconds <= 30) {
      interval = 5; // every 5 seconds
    } else if (totalSeconds <= 120) {
      interval = 10; // every 10 seconds
    } else if (totalSeconds <= 300) {
      interval = 30; // every 30 seconds
    } else {
      interval = 60; // every minute
    }

    // Minor tick interval (smaller ticks between major ones)
    const minorInterval = interval / 5;

    for (let t = 0; t <= totalSeconds; t += minorInterval) {
      const isMajor = t % interval === 0;
      markers.push({
        time: t,
        label: formatTime(t),
        major: isMajor,
      });
    }

    return markers;
  };

  const timeMarkers = getTimeMarkers();

  return (
    <div className="shrink-0 border-t border-neutral-800 bg-[#0a0a0a]">
      {/* Timeline container with ruler + tracks */}
      <div ref={trackRef} className="relative">
        {/* Ruler / Scrubber bar */}
        <div
          className={`relative h-7 bg-neutral-900 border-b border-neutral-700 ${isDragging ? "cursor-grabbing" : "cursor-pointer"}`}
          onMouseDown={handleMouseDown}
        >
          {/* Time markers with ticks */}
          {timeMarkers.map((marker) => {
            const position = totalSeconds > 0 ? (marker.time / totalSeconds) * 100 : 0;
            return (
              <div
                key={marker.time}
                className="absolute bottom-0 pointer-events-none"
                style={{ left: `${position}%` }}
              >
                {/* Tick mark */}
                <div
                  className={`absolute bottom-0 left-1/2 -translate-x-1/2 ${
                    marker.major ? "h-2 w-px bg-neutral-500" : "h-1 w-px bg-neutral-700"
                  }`}
                />
                {/* Time label (only for major ticks) */}
                {marker.major && (
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-mono text-neutral-500 whitespace-nowrap">
                    {marker.label}
                  </span>
                )}
              </div>
            );
          })}

          {/* Playhead handle on ruler */}
          <div
            className="absolute top-0 h-full pointer-events-none z-30"
            style={{ left: `${playheadPosition}%` }}
          >
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-full bg-red-500"
              style={{
                clipPath: "polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)",
              }}
            />
          </div>
        </div>

        {/* Track area */}
        <div className="relative h-14 bg-neutral-950">
          {/* Segment blocks */}
          <div className="absolute inset-0 flex">
            {segments.map((seg, index) => {
              const width = (seg.durationFrames / totalFrames) * 100;
              const isSelected = selectedSentenceId !== null && seg.sentenceIds.includes(selectedSentenceId);
              const thumbnail = getThumbnail(seg);
              const borderColor = sourceColors.get(seg.sourceId) || COLORS[0];

              return (
                <div
                  key={seg.sentenceIds.join("-")}
                  className={`relative h-full overflow-hidden ${
                    isSelected ? "ring-2 ring-white ring-inset z-10" : "hover:brightness-110"
                  }`}
                  style={{
                    width: `${width}%`,
                    marginLeft: index > 0 ? "1px" : 0,
                  }}
                  onClick={(e) => handleSegmentClick(e, seg.sentenceIds[0], seg.startFrame)}
                  title={seg.text.slice(0, 50) + (seg.text.length > 50 ? "..." : "")}
                >
                  {/* Thumbnail background */}
                  {thumbnail && (
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${thumbnail})` }}
                    />
                  )}
                  {/* Fallback dark background if no thumbnail */}
                  {!thumbnail && (
                    <div className="absolute inset-0 bg-neutral-800" />
                  )}
                  {/* Color indicator bar at top */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: borderColor }}
                  />
                </div>
              );
            })}
          </div>

          {/* Playhead line extending through tracks */}
          <div
            className="absolute top-0 h-full pointer-events-none z-20"
            style={{ left: `${playheadPosition}%` }}
          >
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
