import { useState, useEffect } from "react";
import { Heatmap } from "@paper-design/shaders-react";
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

export function ProcessingView({ phase, error, onRetry }: ProcessingViewProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (phase === "ready" || phase === "idle" || phase === "error") {
      return;
    }

    // Rotate messages synced with shader animation (~1.5s cycle at speed 1.48)
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % FUN_MESSAGES.length);
    }, 1500);

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
    return null;
  }

  return (
    <div className="relative h-full w-full">
      {/* Heatmap shader background */}
      <Heatmap
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          inset: 0,
        }}
        image="/Lexi-cut.svg"
        colors={["#05ddfa", "#f652ffc2"]}
        colorBack="#000000"
        contour={0.5}
        angle={0}
        noise={0.44}
        innerGlow={0}
        outerGlow={0.5}
        speed={1.48}
        scale={0.7}
        offsetX={0}
        offsetY={0}
      />

      {/* Fun rotating message overlaid on top */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="text-xl font-bold text-white">
          {FUN_MESSAGES[messageIndex]}
        </div>
      </div>
    </div>
  );
}
