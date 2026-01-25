import { useState, useEffect, useCallback } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export type ExportPhase = "idle" | "preparing" | "rendering" | "finalizing" | "complete" | "error";

export interface ExportProgressEvent {
  phase: ExportPhase;
  currentSegment: number;
  totalSegments: number;
  currentTime?: number;
  totalTime?: number;
  fps?: number;
  percent?: number;
}

export interface ExportProgressState {
  phase: ExportPhase;
  currentSegment: number;
  totalSegments: number;
  currentTime: number;
  totalTime: number;
  fps: number | null;
  percent: number;
}

const initialState: ExportProgressState = {
  phase: "idle",
  currentSegment: 0,
  totalSegments: 0,
  currentTime: 0,
  totalTime: 0,
  fps: null,
  percent: 0,
};

export function useExportProgress() {
  const [progress, setProgress] = useState<ExportProgressState>(initialState);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      unlisten = await listen<ExportProgressEvent>("export-progress", (event) => {
        const data = event.payload;
        setProgress({
          phase: data.phase as ExportPhase,
          currentSegment: data.currentSegment,
          totalSegments: data.totalSegments,
          currentTime: data.currentTime ?? 0,
          totalTime: data.totalTime ?? 0,
          fps: data.fps ?? null,
          percent: data.percent ?? 0,
        });
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const reset = useCallback(() => {
    setProgress(initialState);
  }, []);

  return { progress, reset };
}
