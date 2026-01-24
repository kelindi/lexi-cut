import { Play, Pause } from "@phosphor-icons/react";
import { formatTime, framesToSeconds } from "../../stores/usePlaybackStore";

interface PlaybackControlsProps {
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (frame: number) => void;
}

export function PlaybackControls({
  isPlaying,
  currentFrame,
  totalFrames,
  onPlay,
  onPause,
  onSeek,
}: PlaybackControlsProps) {
  const currentTime = formatTime(framesToSeconds(currentFrame));
  const totalTime = formatTime(framesToSeconds(totalFrames));
  const progress = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0;

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const frame = Math.round(percent * totalFrames);
    onSeek(Math.max(0, Math.min(frame, totalFrames - 1)));
  };

  return (
    <div className="border-t border-neutral-800 bg-[#0a0a0a] p-4">
      {/* Scrubber */}
      <div
        className="mb-3 h-1 cursor-pointer bg-neutral-800"
        onClick={handleScrub}
      >
        <div
          className="h-full bg-white transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-4">
        {/* Play/pause button */}
        <button
          onClick={isPlaying ? onPause : onPlay}
          className="flex h-8 w-8 items-center justify-center text-white hover:text-neutral-300"
        >
          {isPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
        </button>

        {/* Time display */}
        <span className="font-mono text-sm text-neutral-400">
          {currentTime} / {totalTime}
        </span>
      </div>
    </div>
  );
}
