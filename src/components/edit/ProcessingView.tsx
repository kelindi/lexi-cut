import { useState, useEffect } from "react";
import { Quantum } from "ldrs/react";
import "ldrs/react/Quantum.css";
import type { ProcessingPhase, ProcessingProgress } from "../../types";

interface ProcessingViewProps {
  phase: ProcessingPhase;
  progress: ProcessingProgress | null;
  error: string | null;
  onRetry?: () => void;
}

const FUN_MESSAGES = [
  "Analyzing pixels with extreme prejudice...",
  "Teaching AI to appreciate your cinematography...",
  "Converting chaos into clips...",
  "Summoning the video editing spirits...",
  "Doing the thing with the videos...",
  "Running highly sophisticated algorithms...",
  "Making your footage feel seen...",
  "Consulting the oracle of optimal cuts...",
  "Parsing frames at ludicrous speed...",
  "Transcribing words, ignoring mumbles...",
  "Finding the narrative hidden in your footage...",
  "Applying machine learning magic...",
  "Crunching numbers, vibing hard...",
  "Extracting pure cinema from raw files...",
  "Channeling Spielberg energy...",
];

export function ProcessingView({
  phase,
  error,
  onRetry,
}: ProcessingViewProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (phase === "ready" || phase === "idle" || phase === "error") {
      return;
    }

    // Rotate messages every 3 seconds
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % FUN_MESSAGES.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [phase]);

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
    <div className="flex h-full flex-col items-center justify-center gap-6">
      {/* Quantum loader */}
      <Quantum size="80" speed="1.75" color="white" />

      {/* Fun rotating message */}
      <div className="text-sm text-neutral-400">
        {FUN_MESSAGES[messageIndex]}
      </div>
    </div>
  );
}
