import { create } from "zustand";

export const FPS = 30;

interface PlaybackState {
  isPlaying: boolean;
  currentFrame: number;
  durationInFrames: number;

  // Actions
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seekToFrame: (frame: number) => void;
  setDurationInFrames: (frames: number) => void;
  setCurrentFrame: (frame: number) => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  isPlaying: false,
  currentFrame: 0,
  durationInFrames: 0,

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  toggle: () => set((state) => ({ isPlaying: !state.isPlaying })),
  seekToFrame: (frame) => set({ currentFrame: frame, isPlaying: false }),
  setDurationInFrames: (frames) => set({ durationInFrames: frames }),
  setCurrentFrame: (frame) => set({ currentFrame: frame }),
}));

// Utilities
export const secondsToFrames = (seconds: number): number =>
  Math.round(seconds * FPS);

export const framesToSeconds = (frames: number): number => frames / FPS;

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};
