import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useTimelineSegments } from "./useTimelineSegments";

export interface ExportSegment {
  sourcePath: string;
  startTime: number;
  endTime: number;
}

export interface ExportProgress {
  current: number;
  total: number;
  phase: "preparing" | "rendering" | "complete";
}

export function useExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const segments = useTimelineSegments();

  const exportVideo = useCallback(async () => {
    if (segments.length === 0) {
      setError("No segments to export");
      return;
    }

    setIsExporting(true);
    setError(null);
    setProgress({ current: 0, total: segments.length, phase: "preparing" });

    try {
      // Ask user for output path
      const outputPath = await save({
        defaultPath: "export.mp4",
        filters: [{ name: "Video", extensions: ["mp4"] }],
      });

      if (!outputPath) {
        setIsExporting(false);
        setProgress(null);
        return;
      }

      // Build export segments
      const exportSegments: ExportSegment[] = segments.map((seg) => ({
        sourcePath: seg.sourcePath,
        startTime: seg.sourceStart,
        endTime: seg.sourceEnd,
      }));

      setProgress({ current: 0, total: segments.length, phase: "rendering" });

      // Call Tauri export command
      await invoke("export_video", {
        segments: exportSegments,
        outputPath,
      });

      setProgress({ current: segments.length, total: segments.length, phase: "complete" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsExporting(false);
    }
  }, [segments]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    exportVideo,
    isExporting,
    progress,
    error,
    clearError,
    canExport: segments.length > 0,
  };
}
