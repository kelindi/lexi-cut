import { useEffect, useCallback, useRef } from "react";
import { Panel, Group as PanelGroup, Separator } from "react-resizable-panels";
import { TranscriptPanel } from "../components/edit/TranscriptPanel";
import { VideoPanel } from "../components/edit/VideoPanel";
import { ProcessingView } from "../components/edit/ProcessingView";
import { ConversationPanel } from "../components/edit/ConversationPanel";
import { useSourcesStore } from "../stores/useSourcesStore";
import { useProjectStore } from "../stores/useProjectStore";
import { runPipeline } from "../api/processingPipeline";
import { executeAgenticAssemblyCut } from "../api/agenticEdit";
import { useSaveProject } from "../hooks/useSaveProject";

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

  // Initialize save hook (also registers Cmd/Ctrl+S keyboard shortcut)
  const { save } = useSaveProject();

  const phase = useProjectStore((s) => s.phase);
  const progress = useProjectStore((s) => s.progress);
  const error = useProjectStore((s) => s.error);
  const segmentGroups = useProjectStore((s) => s.segmentGroups);
  const timeline = useProjectStore((s) => s.timeline);
  const setPhase = useProjectStore((s) => s.setPhase);
  const setProgress = useProjectStore((s) => s.setProgress);
  const setError = useProjectStore((s) => s.setError);
  const setWords = useProjectStore((s) => s.setWords);
  const setSegmentGroups = useProjectStore((s) => s.setSegmentGroups);
  const setOrderedGroupIds = useProjectStore((s) => s.setOrderedGroupIds);
  const setSentences = useProjectStore((s) => s.setSentences);
  const setTranscriptlessSourceIds = useProjectStore((s) => s.setTranscriptlessSourceIds);
  const setBrollClassifications = useProjectStore((s) => s.setBrollClassifications);
  const initializeTimeline = useProjectStore((s) => s.initializeTimeline);

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
      setBrollClassifications(result.brollClassifications);
      // Initialize the timeline from fresh sentences
      initializeTimeline(result.sentences);

      // Run agentic assembly cut (graceful fallback to chronological order)
      setPhase("assembling");
      try {
        await executeAgenticAssemblyCut({
          onToolStart: (name, input) => {
            console.log(`[assemblyCut] Tool: ${name}`, input);
          },
          onToolComplete: (name, result) => {
            console.log(`[assemblyCut] ${name}: ${result}`);
          },
        });
      } catch (e) {
        console.warn("[assemblyCut] Failed, using chronological order:", e);
        // Timeline stays in chronological order - graceful fallback
      }

      setPhase("ready");
      setProgress(null);

      // Auto-save after first assembly cut completes
      await save();
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
    setBrollClassifications,
    initializeTimeline,
    updateSourceDescriptions,
    save,
  ]);

  // Auto-run pipeline when sources change and we don't have results
  const pipelineStarted = useRef(false);
  useEffect(() => {
    // Check both segmentGroups (legacy) and timeline.entries for existing data
    const hasData = segmentGroups.length > 0 || timeline.entries.length > 0;
    if (sources.length > 0 && !hasData && phase === "idle" && !pipelineStarted.current) {
      pipelineStarted.current = true;
      runProcessing();
    }
  }, [sources.length, segmentGroups.length, timeline.entries.length, phase, runProcessing]);

  const hasData = segmentGroups.length > 0 || timeline.entries.length > 0;
  const isReady = phase === "ready" && hasData;
  const isProcessing = phase !== "idle" && phase !== "ready" && phase !== "error";
  // Show spinner when we have sources but no data yet (about to start processing)
  const isAboutToProcess = phase === "idle" && sources.length > 0 && !hasData;

  // Show processing/error states
  if (isProcessing || isAboutToProcess || phase === "error") {
    return (
      <main className="h-[calc(100vh-3rem)] bg-[#0a0a0a]">
        <ProcessingView
          phase={isAboutToProcess ? "transcribing" : phase}
          progress={progress}
          error={error}
          onRetry={runProcessing}
        />
      </main>
    );
  }

  if (!isReady) {
    return (
      <main className="h-[calc(100vh-3rem)] bg-[#0a0a0a]">
        <ProcessingView phase="idle" progress={null} error={null} />
      </main>
    );
  }

  return (
    <main className="h-[calc(100vh-3rem)] bg-[#0a0a0a]">
      <PanelGroup orientation="vertical" className="h-full">
        {/* Main content area */}
        <Panel defaultSize={70} minSize={30}>
          <PanelGroup orientation="horizontal" className="h-full">
            {/* Transcript panel (left) */}
            <Panel defaultSize={65} minSize={20}>
              <div className="h-full overflow-hidden">
                <TranscriptPanel />
              </div>
            </Panel>
            <ResizeHandle orientation="horizontal" />

            {/* Video panel (right) */}
            <Panel defaultSize={35} minSize={20}>
              <div className="h-full overflow-hidden">
                <VideoPanel />
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        <ResizeHandle orientation="vertical" />

        {/* Conversation panel (bottom) */}
        <Panel defaultSize={20} minSize={10}>
          <ConversationPanel />
        </Panel>
      </PanelGroup>
    </main>
  );
}
