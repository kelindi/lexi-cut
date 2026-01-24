import { useTimelineSegments, useTotalDuration } from "../../hooks/useTimelineSegments";
import { usePlaybackStore, framesToSeconds, formatTime } from "../../stores/usePlaybackStore";
import { useSelectionStore } from "../../stores/useSelectionStore";

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
  const selectedBlockId = useSelectionStore((s) => s.selectedBlockId);
  const selectBlock = useSelectionStore((s) => s.selectBlock);

  // Build source → color mapping
  const sourceColors = new Map<string, string>();
  let colorIndex = 0;
  for (const seg of segments) {
    if (!sourceColors.has(seg.sourceId)) {
      sourceColors.set(seg.sourceId, COLORS[colorIndex % COLORS.length]);
      colorIndex++;
    }
  }

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const frame = Math.round(percent * totalFrames);
    seekToFrame(Math.max(0, Math.min(frame, totalFrames - 1)));
  };

  const handleSegmentClick = (
    e: React.MouseEvent,
    groupId: string,
    startFrame: number
  ) => {
    e.stopPropagation();
    selectBlock(groupId);
    seekToFrame(startFrame);
  };

  if (segments.length === 0) {
    return null;
  }

  const playheadPosition = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0;

  return (
    <div className="border-t border-neutral-800 bg-[#0a0a0a] p-4">
      {/* Time labels */}
      <div className="mb-1 flex justify-between text-xs text-neutral-500 font-mono">
        <span>0:00</span>
        <span>{formatTime(framesToSeconds(totalFrames))}</span>
      </div>

      {/* Timeline track */}
      <div
        className="relative h-8 cursor-pointer bg-neutral-900"
        onClick={handleTimelineClick}
      >
        {/* Segment blocks */}
        {segments.map((seg) => {
          const left = (seg.startFrame / totalFrames) * 100;
          const width = (seg.durationFrames / totalFrames) * 100;
          const isSelected = selectedBlockId === seg.groupId;

          return (
            <div
              key={seg.groupId}
              className={`absolute top-0 h-full transition-opacity ${
                isSelected ? "ring-1 ring-white" : "hover:opacity-80"
              }`}
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: sourceColors.get(seg.sourceId) || COLORS[0],
              }}
              onClick={(e) => handleSegmentClick(e, seg.groupId, seg.startFrame)}
              title={seg.text.slice(0, 50) + (seg.text.length > 50 ? "..." : "")}
            />
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white pointer-events-none"
          style={{ left: `${playheadPosition}%` }}
        >
          <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white" />
        </div>
      </div>
    </div>
  );
}
