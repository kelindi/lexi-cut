import { CircleNotch } from "@phosphor-icons/react";
import type { ProcessingPhase, ProcessingProgress } from "../../types";

interface ProcessingViewProps {
  phase: ProcessingPhase;
  progress: ProcessingProgress | null;
  error: string | null;
  onRetry?: () => void;
}

const PHASE_LABELS: Record<ProcessingPhase, string> = {
  idle: "Ready",
  transcribing: "Transcribing audio...",
  grouping: "Grouping segments...",
  describing: "Analyzing video content...",
  assembling: "Analyzing narrative...",
  ready: "Complete",
  error: "Error",
};

export function ProcessingView({
  phase,
  progress,
  error,
  onRetry,
}: ProcessingViewProps) {
  if (phase === "ready") {
    return null;
  }

  if (phase === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="text-red-500">Processing failed</div>
        {error && (
          <div className="max-w-md text-sm text-neutral-400">{error}</div>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="border border-neutral-700 px-4 py-2 text-sm text-white hover:bg-neutral-800"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Add clips to begin
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      {/* Spinner */}
      <CircleNotch size={32} className="animate-spin text-white" />

      {/* Phase label */}
      <div className="text-white">{PHASE_LABELS[phase]}</div>

      {/* Progress message */}
      {progress?.message && (
        <div className="text-sm text-neutral-400">{progress.message}</div>
      )}

      {/* Progress bar */}
      {progress && progress.total > 1 && (
        <div className="w-64">
          <div className="mb-1 flex justify-between text-xs text-neutral-500">
            <span>
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="h-1 bg-neutral-800">
            <div
              className="h-full bg-white transition-[width]"
              style={{
                width: `${(progress.current / progress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
