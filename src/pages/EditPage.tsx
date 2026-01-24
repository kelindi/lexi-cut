import { useEffect, useCallback, useRef } from "react";
import { Export } from "@phosphor-icons/react";
import { TranscriptPanel } from "../components/edit/TranscriptPanel";
import { VideoPanel } from "../components/edit/VideoPanel";
import { Timeline } from "../components/edit/Timeline";
import { ProcessingView } from "../components/edit/ProcessingView";
import { useSourcesStore } from "../stores/useSourcesStore";
import { useProjectStore } from "../stores/useProjectStore";
import { useExport } from "../hooks/useExport";
import { runPipeline } from "../api/processingPipeline";

export function EditPage() {
  const sources = useSourcesStore((s) => s.sources);

  const phase = useProjectStore((s) => s.phase);
  const progress = useProjectStore((s) => s.progress);
  const error = useProjectStore((s) => s.error);
  const segmentGroups = useProjectStore((s) => s.segmentGroups);
  const setPhase = useProjectStore((s) => s.setPhase);
  const setProgress = useProjectStore((s) => s.setProgress);
  const setError = useProjectStore((s) => s.setError);
  const setSegments = useProjectStore((s) => s.setSegments);
  const setSegmentGroups = useProjectStore((s) => s.setSegmentGroups);
  const setOrderedGroupIds = useProjectStore((s) => s.setOrderedGroupIds);

  const { exportVideo, isExporting, canExport } = useExport();

  // Run processing pipeline when sources are available and not already processed
  const runProcessing = useCallback(async () => {
    if (sources.length === 0) {
      setPhase("idle");
      return;
    }

    setPhase("transcribing");
    setError(null);

    try {
      const result = await runPipeline(sources, (p) => {
        setProgress(p);
        if (p.message?.includes("Transcribing")) {
          setPhase("transcribing");
        } else if (p.message?.includes("Grouping")) {
          setPhase("grouping");
        } else if (p.message?.includes("Describing")) {
          setPhase("describing");
        } else if (p.message?.includes("Analyzing")) {
          setPhase("assembling");
        }
      });

      setSegments(result.segments);
      setSegmentGroups(result.segmentGroups);
      setOrderedGroupIds(result.orderedGroupIds);
      setPhase("ready");
      setProgress(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [
    sources,
    setPhase,
    setProgress,
    setError,
    setSegments,
    setSegmentGroups,
    setOrderedGroupIds,
  ]);

  // Auto-run pipeline when sources change and we don't have results
  const pipelineStarted = useRef(false);
  useEffect(() => {
    if (sources.length > 0 && segmentGroups.length === 0 && phase === "idle" && !pipelineStarted.current) {
      pipelineStarted.current = true;
      runProcessing();
    }
  }, [sources.length, segmentGroups.length, phase, runProcessing]);

  const isReady = phase === "ready" && segmentGroups.length > 0;
  const isProcessing = phase !== "idle" && phase !== "ready" && phase !== "error";

  return (
    <main className="flex h-[calc(100vh-5rem)] flex-col overflow-hidden bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <span className="text-sm font-medium text-white">lexi-cut</span>
        <button
          onClick={exportVideo}
          disabled={!canExport || isExporting}
          className="flex items-center gap-2 border border-neutral-700 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Export size={16} />
          {isExporting ? "Exporting..." : "Export"}
        </button>
      </header>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {isProcessing || phase === "error" || (phase === "idle" && sources.length === 0) ? (
          <div className="flex-1">
            <ProcessingView
              phase={phase}
              progress={progress}
              error={error}
              onRetry={runProcessing}
            />
          </div>
        ) : isReady ? (
          <>
            {/* Transcript panel (left) */}
            <div className="w-2/3 border-r border-neutral-800 overflow-hidden">
              <div className="h-full flex flex-col">
                <div className="border-b border-neutral-800 px-4 py-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Transcript
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <TranscriptPanel />
                </div>
              </div>
            </div>

            {/* Video panel (right) */}
            <div className="w-1/3 overflow-hidden">
              <div className="h-full flex flex-col">
                <div className="border-b border-neutral-800 px-4 py-2">
                  <span className="text-xs font-medium uppercase text-neutral-500">
                    Preview
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <VideoPanel />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1">
            <ProcessingView
              phase="idle"
              progress={null}
              error={null}
            />
          </div>
        )}
      </div>

      {/* Timeline (bottom) */}
      {isReady && <Timeline />}
    </main>
  );
}
