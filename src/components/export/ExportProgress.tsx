import { CheckCircle, XCircle, Spinner, FolderOpen, File } from "@phosphor-icons/react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ExportProgressState } from "../../hooks/useExportProgress";

interface ExportProgressProps {
  progress: ExportProgressState;
  error: string | null;
  outputPath: string | null;
  onClose: () => void;
  onReset: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getPhaseLabel(phase: string): string {
  switch (phase) {
    case "preparing":
      return "Preparing...";
    case "rendering":
      return "Rendering...";
    case "finalizing":
      return "Finalizing...";
    case "complete":
      return "Export Complete";
    case "error":
      return "Export Failed";
    default:
      return "Starting...";
  }
}

export function ExportProgress({
  progress,
  error,
  outputPath,
  onClose,
  onReset,
}: ExportProgressProps) {
  const isComplete = progress.phase === "complete";
  const isError = progress.phase === "error" || error !== null;
  const isInProgress = !isComplete && !isError;

  const handleOpenFile = async () => {
    if (outputPath) {
      await openPath(outputPath);
    }
  };

  const handleOpenFolder = async () => {
    if (outputPath) {
      await revealItemInDir(outputPath);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Status Icon */}
      <div className="flex flex-col items-center gap-3 py-4">
        {isComplete && (
          <CheckCircle size={48} weight="fill" className="text-green-500" />
        )}
        {isError && (
          <XCircle size={48} weight="fill" className="text-red-500" />
        )}
        {isInProgress && (
          <Spinner size={48} className="animate-spin text-white" />
        )}
        <span className="text-sm font-medium text-white">
          {getPhaseLabel(progress.phase)}
        </span>
      </div>

      {/* Progress Bar */}
      {isInProgress && (
        <div className="flex flex-col gap-2">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${Math.min(progress.percent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-white/50">
            <span>
              Segment {progress.currentSegment} of {progress.totalSegments}
            </span>
            <span>{Math.round(progress.percent)}%</span>
          </div>
        </div>
      )}

      {/* Progress Details */}
      {isInProgress && (
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <div className="flex justify-between text-xs">
            <span className="text-white/50">Time</span>
            <span className="text-white">
              {formatTime(progress.currentTime)} / {formatTime(progress.totalTime)}
            </span>
          </div>
          {progress.fps !== null && (
            <div className="mt-1 flex justify-between text-xs">
              <span className="text-white/50">Speed</span>
              <span className="text-white">{progress.fps.toFixed(1)} fps</span>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {isError && error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Success Actions */}
      {isComplete && outputPath && (
        <div className="flex flex-col gap-2">
          <button
            onClick={handleOpenFile}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            <File size={16} />
            Open File
          </button>
          <button
            onClick={handleOpenFolder}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            <FolderOpen size={16} />
            Show in Folder
          </button>
        </div>
      )}

      {/* Bottom Actions */}
      <div className="flex gap-2">
        {(isComplete || isError) && (
          <button
            onClick={onReset}
            className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            Export Another
          </button>
        )}
        <button
          onClick={onClose}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            isComplete || isError
              ? "flex-1 bg-white/10 text-white hover:bg-white/20"
              : "w-full border border-white/10 text-white/50 hover:bg-white/5 hover:text-white"
          }`}
        >
          {isInProgress ? "Cancel" : "Close"}
        </button>
      </div>
    </div>
  );
}
