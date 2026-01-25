import { Play, Pause, SkipBack, Rewind, CaretLeft, CaretRight, FastForward, SkipForward } from "@phosphor-icons/react";
import { usePlaybackStore, formatTime, framesToSeconds } from "../../stores/usePlaybackStore";

interface PlaybackControlsProps {
  isPlaying: boolean;
  totalFrames: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (frame: number) => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onJumpStart: () => void;
  onJumpEnd: () => void;
}

export function PlaybackControls({
  isPlaying,
  totalFrames,
  onPlay,
  onPause,
  onSeek,
  onSkipBack,
  onSkipForward,
  onStepBack,
  onStepForward,
  onJumpStart,
  onJumpEnd,
}: PlaybackControlsProps) {
  // Get currentFrame directly to isolate re-renders to this component
  const currentFrame = usePlaybackStore((s) => s.currentFrame);
  const currentTime = formatTime(framesToSeconds(currentFrame));
  const totalTime = formatTime(framesToSeconds(totalFrames));
  const progress = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0;

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const frame = Math.round(percent * totalFrames);
    onSeek(Math.max(0, Math.min(frame, totalFrames - 1)));
  };

  const btnBase = "flex items-center justify-center rounded transition-all duration-150 active:scale-90";
  const btnSmall = `${btnBase} h-7 w-7 text-neutral-400 hover:text-white hover:bg-neutral-800`;
  const btnMedium = `${btnBase} h-8 w-8 text-neutral-300 hover:text-white hover:bg-neutral-800`;

  return (
    <div className="relative border-t border-neutral-800 bg-[#0a0a0a] px-4 py-3">
      {/* Scrubber */}
      <div
        className="group mb-3 h-1 cursor-pointer rounded-full bg-neutral-800"
        onClick={handleScrub}
      >
        <div
          className="h-full rounded-full bg-white transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-center gap-1">
        {/* Left group: Jump & Skip back */}
        <div className="flex items-center gap-0.5">
          <button onClick={onJumpStart} className={btnSmall} title="Jump to start (Home)">
            <SkipBack size={14} weight="fill" />
          </button>
          <button onClick={onSkipBack} className={btnSmall} title="Skip back 5s (←)">
            <Rewind size={14} weight="fill" />
          </button>
        </div>

        {/* Center group: Frame step + Play */}
        <div className="flex items-center gap-0.5 mx-1">
          <button onClick={onStepBack} className={btnMedium} title="Step back 1 frame (,)">
            <CaretLeft size={20} weight="bold" />
          </button>

          {/* Play/pause - prominent */}
          <button
            onClick={isPlaying ? onPause : onPlay}
            className={`${btnBase} h-10 w-10 mx-1 rounded-full bg-[#333] text-white hover:bg-[#444] ${!isPlaying ? 'animate-subtle-pulse' : ''}`}
            title="Play/Pause (Space)"
          >
            {isPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" className="ml-0.5" />}
          </button>

          <button onClick={onStepForward} className={btnMedium} title="Step forward 1 frame (.)">
            <CaretRight size={20} weight="bold" />
          </button>
        </div>

        {/* Right group: Skip & Jump forward */}
        <div className="flex items-center gap-0.5">
          <button onClick={onSkipForward} className={btnSmall} title="Skip forward 5s (→)">
            <FastForward size={14} weight="fill" />
          </button>
          <button onClick={onJumpEnd} className={btnSmall} title="Jump to end (End)">
            <SkipForward size={14} weight="fill" />
          </button>
        </div>

        {/* Time display - right aligned */}
        <div className="absolute right-4 font-mono text-xs text-neutral-500">
          <span className="text-neutral-300">{currentTime}</span>
          <span className="mx-1">/</span>
          <span>{totalTime}</span>
        </div>
      </div>
    </div>
  );
}
