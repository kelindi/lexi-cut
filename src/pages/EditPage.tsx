import { useEffect, useCallback, useRef } from "react";
import { Panel, Group as PanelGroup, Separator } from "react-resizable-panels";
import { TranscriptPanel } from "../components/edit/TranscriptPanel";
import { VideoPanel } from "../components/edit/VideoPanel";
import { Timeline } from "../components/edit/Timeline";
import { ProcessingView } from "../components/edit/ProcessingView";
import { useSourcesStore } from "../stores/useSourcesStore";
import { useProjectStore } from "../stores/useProjectStore";
import { runPipeline } from "../api/processingPipeline";

function ResizeHandle({ orientation = "horizontal" }: { orientation?: "horizontal" | "vertical" }) {
  const isHorizontal = orientation === "horizontal";
  return (
    <Separator
      className={`group relative flex items-center justify-center bg-neutral-900 hover:bg-neutral-700 transition-colors ${
        isHorizontal ? "w-1 hover:w-1.5" : "h-1 hover:h-1.5"
      }`}
    >
      <div
        className={`rounded-full bg-neutral-600 group-hover:bg-neutral-400 transition-colors ${
          isHorizontal ? "h-8 w-1" : "w-8 h-1"
        }`}
      />
    </Separator>
  );
}

export function EditPage() {
  const sources = useSourcesStore((s) => s.sources);
  const updateSourceDescriptions = useSourcesStore((s) => s.updateSourceDescriptions);

  const phase = useProjectStore((s) => s.phase);
  const progress = useProjectStore((s) => s.progress);
  const error = useProjectStore((s) => s.error);
  const segmentGroups = useProjectStore((s) => s.segmentGroups);
  const setPhase = useProjectStore((s) => s.setPhase);
  const setProgress = useProjectStore((s) => s.setProgress);
  const setError = useProjectStore((s) => s.setError);
  const setWords = useProjectStore((s) => s.setWords);
  const setSegmentGroups = useProjectStore((s) => s.setSegmentGroups);
  const setOrderedGroupIds = useProjectStore((s) => s.setOrderedGroupIds);
  const setSentences = useProjectStore((s) => s.setSentences);
  const setTranscriptlessSourceIds = useProjectStore((s) => s.setTranscriptlessSourceIds);
  const transcriptlessSourceIds = useProjectStore((s) => s.transcriptlessSourceIds);

  // Run processing pipeline when sources are available and not already processed
  const runProcessing = useCallback(async () => {
    if (sources.length === 0) {
      setPhase("idle");
      return;
    }

    setPhase("transcribing");
    setError(null);

    try {
      const result = await runPipeline(
        sources,
        (p) => {
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
        },
        updateSourceDescriptions
      );

      setWords(result.words);
      setSegmentGroups(result.segmentGroups);
      setOrderedGroupIds(result.orderedGroupIds);
      setSentences(result.sentences);
      setTranscriptlessSourceIds(result.transcriptlessSourceIds);
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
    setWords,
    setSegmentGroups,
    setOrderedGroupIds,
    setSentences,
    setTranscriptlessSourceIds,
    updateSourceDescriptions,
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

  // Determine if all sources are transcriptless (no transcript panel needed)
  const isFullyTranscriptless =
    transcriptlessSourceIds.length > 0 &&
    transcriptlessSourceIds.length === sources.length;

  // Show processing/error states
  if (isProcessing || phase === "error" || (phase === "idle" && sources.length === 0)) {
    return (
      <main className="h-[calc(100vh-8rem)] bg-[#0a0a0a]">
        <ProcessingView
          phase={phase}
          progress={progress}
          error={error}
          onRetry={runProcessing}
        />
      </main>
    );
  }

  if (!isReady) {
    return (
      <main className="h-[calc(100vh-8rem)] bg-[#0a0a0a]">
        <ProcessingView phase="idle" progress={null} error={null} />
      </main>
    );
  }

  return (
    <main className="h-[calc(100vh-8rem)] bg-[#0a0a0a]">
      <PanelGroup orientation="vertical" className="h-full">
        {/* Main content area */}
        <Panel defaultSize={70} minSize={30}>
          <PanelGroup orientation="horizontal" className="h-full">
            {/* Transcript panel (left) - hidden when fully transcriptless */}
            {!isFullyTranscriptless && (
              <>
                <Panel defaultSize={65} minSize={20}>
                  <div className="h-full overflow-hidden">
                    <TranscriptPanel />
                  </div>
                </Panel>
                <ResizeHandle orientation="horizontal" />
              </>
            )}

            {/* Video panel (right, or full width if transcriptless) */}
            <Panel defaultSize={isFullyTranscriptless ? 100 : 35} minSize={20}>
              <div className="h-full overflow-hidden">
                <VideoPanel />
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        <ResizeHandle orientation="vertical" />

        {/* Timeline (bottom) */}
        <Panel defaultSize={30} minSize={10}>
          <Timeline />
        </Panel>
      </PanelGroup>
    </main>
  );
}
