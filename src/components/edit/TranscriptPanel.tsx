import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SentenceItem } from "./SentenceItem";
import { useProjectStore } from "../../stores/useProjectStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { useSourcesStore } from "../../stores/useSourcesStore";
import { usePlaybackStore, secondsToFrames, framesToSeconds } from "../../stores/usePlaybackStore";
import { useTimelineSegments } from "../../hooks/useTimelineSegments";
import { matchDescriptionsToSentences } from "../../utils/descriptionMatcher";
import { clearVideoOverride } from "../../stores/useAgenticStore";
import type { Sentence, TimelineEntry, SourceDescription } from "../../types";

// Color palette for source files - matches Timeline.tsx
const SOURCE_COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#06b6d4", // cyan
];

export function TranscriptPanel() {
  // Project state - use timeline instead of flat arrays
  const timeline = useProjectStore((s) => s.timeline);
  const sentences = useProjectStore((s) => s.sentences);
  const words = useProjectStore((s) => s.words);
  const reorderEntry = useProjectStore((s) => s.reorderEntry);
  const setEntryExcluded = useProjectStore((s) => s.setEntryExcluded);
  const toggleWordExcluded = useProjectStore((s) => s.toggleWordExcluded);
  const brollClassifications = useProjectStore((s) => s.brollClassifications);

  // Sources state (for descriptions)
  const sources = useSourcesStore((s) => s.sources);

  // Playback state
  const currentFrame = usePlaybackStore((s) => s.currentFrame);
  const seekToFrame = usePlaybackStore((s) => s.seekToFrame);

  // Timeline segments for playback position calculation
  const timelineSegments = useTimelineSegments();

  // Selection state (shared with Timeline component)
  const selectedSentenceId = useSelectionStore((s) => s.selectedSentenceId);
  const selectedWordId = useSelectionStore((s) => s.selectedWordId);
  const selectSentence = useSelectionStore((s) => s.selectSentence);
  const selectWord = useSelectionStore((s) => s.selectWord);

  // Refs for scroll-into-view
  const containerRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastActiveSentenceId = useRef<string | null>(null);

  // Build sentence map for lookups
  const sentenceMap = useMemo(
    () => new Map(sentences.map((s) => [s.sentenceId, s])),
    [sentences]
  );

  // Build sourceId → descriptions map
  const descriptionsBySource = useMemo(() => {
    const map = new Map<string, SourceDescription[]>();
    for (const source of sources) {
      if (source.descriptions && source.descriptions.length > 0) {
        map.set(source.id, source.descriptions);
      }
    }
    return map;
  }, [sources]);

  // Build sourceId → name map for B-roll display
  const sourceNameMap = useMemo(() => {
    return new Map(sources.map((s) => [s.id, s.name]));
  }, [sources]);

  // Match descriptions to sentences (each description shows once, on first overlapping sentence)
  const sentenceDescriptions = useMemo(
    () => matchDescriptionsToSentences(timeline.entries, sentenceMap, descriptionsBySource),
    [timeline.entries, sentenceMap, descriptionsBySource]
  );

  // All entries with their corresponding sentences
  const entriesWithSentences = useMemo((): Array<{ entry: TimelineEntry; sentence: Sentence }> => {
    return timeline.entries
      .map((entry) => {
        const sentence = sentenceMap.get(entry.sentenceId);
        if (!sentence) return null;
        return { entry, sentence };
      })
      .filter((item): item is { entry: TimelineEntry; sentence: Sentence } => item !== null);
  }, [timeline.entries, sentenceMap]);

  // Build source → color mapping (consistent with Timeline)
  const sourceColors = useMemo(() => {
    const colorMap = new Map<string, string>();
    let colorIndex = 0;
    for (const sentence of sentences) {
      if (!colorMap.has(sentence.sourceId)) {
        colorMap.set(sentence.sourceId, SOURCE_COLORS[colorIndex % SOURCE_COLORS.length]);
        colorIndex++;
      }
    }
    return colorMap;
  }, [sentences]);

  // Detect moved sentences - compare current order vs chronological order PER SOURCE
  const movedSentenceIds = useMemo(() => {
    const moved = new Set<string>();

    // Get non-excluded entries in current order
    const currentOrder = timeline.entries
      .filter((e) => !e.excluded)
      .map((e) => e.sentenceId);

    // Group sentences by source
    const sentencesBySource = new Map<string, string[]>();
    for (const id of currentOrder) {
      const sentence = sentenceMap.get(id);
      if (!sentence) continue;
      if (!sentencesBySource.has(sentence.sourceId)) {
        sentencesBySource.set(sentence.sourceId, []);
      }
      sentencesBySource.get(sentence.sourceId)!.push(id);
    }

    // For each source, check if sentences are in chronological order
    for (const [, sourceIds] of sentencesBySource) {
      // Create chronological order for this source based on startTime
      const chronologicalOrder = [...sourceIds].sort((a, b) => {
        const sentA = sentenceMap.get(a);
        const sentB = sentenceMap.get(b);
        if (!sentA || !sentB) return 0;
        return sentA.startTime - sentB.startTime;
      });

      // Mark sentences that are in different positions within their source
      for (let i = 0; i < sourceIds.length; i++) {
        if (sourceIds[i] !== chronologicalOrder[i]) {
          moved.add(sourceIds[i]);
        }
      }
    }

    return moved;
  }, [timeline.entries, sentenceMap]);

  // Only non-excluded sentence IDs for sortable context
  const sortableIds = useMemo(
    () => entriesWithSentences
      .filter(({ entry }) => !entry.excluded)
      .map(({ entry }) => entry.sentenceId),
    [entriesWithSentences]
  );

  // Compute active playback state (which sentence/word is playing)
  const activePlayback = useMemo(() => {
    for (const seg of timelineSegments) {
      if (currentFrame >= seg.startFrame && currentFrame < seg.startFrame + seg.durationFrames) {
        const offsetFrames = currentFrame - seg.startFrame;
        const offsetSeconds = framesToSeconds(offsetFrames);
        // Use audio timing for word highlighting (important for B-roll where video timing differs)
        const sourceTime = (seg.audioStart ?? seg.sourceStart) + offsetSeconds;

        // Find which sentence is active
        let activeSentenceId = seg.sentenceIds[0];
        for (const sentenceId of seg.sentenceIds) {
          const sentence = sentenceMap.get(sentenceId);
          if (sentence && sourceTime >= sentence.startTime && sourceTime < sentence.endTime) {
            activeSentenceId = sentenceId;
            break;
          }
        }

        return { sentenceId: activeSentenceId, sourceTime };
      }
    }
    return null;
  }, [currentFrame, timelineSegments, sentenceMap]);

  // Scroll active sentence into view when playback moves to a new sentence
  useEffect(() => {
    if (!activePlayback?.sentenceId) return;
    if (activePlayback.sentenceId === lastActiveSentenceId.current) return;

    lastActiveSentenceId.current = activePlayback.sentenceId;

    // Small delay to let animations settle
    const timeout = setTimeout(() => {
      const element = sentenceRefs.current.get(activePlayback.sentenceId);
      if (element && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();

        // Check if element is outside the visible area (with some padding)
        const padding = 60;
        const isAbove = elementRect.top < containerRect.top + padding;
        const isBelow = elementRect.bottom > containerRect.bottom - padding;

        if (isAbove || isBelow) {
          element.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [activePlayback?.sentenceId]);

  // Clear word selection when playback moves
  const lastSourceTime = useRef<number | null>(null);
  useEffect(() => {
    if (activePlayback?.sourceTime !== undefined) {
      // If sourceTime changed significantly (more than 50ms), clear selection
      if (lastSourceTime.current !== null &&
          Math.abs(activePlayback.sourceTime - lastSourceTime.current) > 0.05) {
        selectWord(null);
      }
      lastSourceTime.current = activePlayback.sourceTime;
    }
  }, [activePlayback?.sourceTime, selectWord]);

  // DnD sensors for sentence reordering
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = timeline.entries.findIndex((e) => e.sentenceId === active.id);
    const newIndex = timeline.entries.findIndex((e) => e.sentenceId === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      reorderEntry(oldIndex, newIndex);
    }
  }, [timeline.entries, reorderEntry]);

  // Handle sentence selection and seek
  const handleSentenceSelect = useCallback((sentence: Sentence) => {
    selectSentence(sentence.sentenceId);

    // Calculate frame position for this sentence
    let framePosition = 0;
    for (const entry of timeline.entries) {
      if (entry.excluded) continue;
      if (entry.sentenceId === sentence.sentenceId) break;
      const s = sentenceMap.get(entry.sentenceId);
      if (s) {
        framePosition += secondsToFrames(s.endTime - s.startTime);
      }
    }
    seekToFrame(framePosition);
  }, [timeline.entries, sentenceMap, selectSentence, seekToFrame]);

  // Handle sentence deletion (exclude)
  const handleSentenceDelete = useCallback((sentenceId: string) => {
    setEntryExcluded(sentenceId, true);
    if (selectedSentenceId === sentenceId) {
      selectSentence(null);
    }
  }, [setEntryExcluded, selectedSentenceId, selectSentence]);

  // Handle sentence restore (include)
  const handleSentenceRestore = useCallback((sentenceId: string) => {
    setEntryExcluded(sentenceId, false);
  }, [setEntryExcluded]);

  // Handle word selection (immediate feedback)
  const handleSelectWord = useCallback((wordId: string) => {
    selectWord(wordId);
  }, [selectWord]);

  // Handle word seek (delayed to allow double-click)
  const handleSeekToWord = useCallback((wordSourceTime: number) => {
    // Find the segment that contains this word's source time
    const timelineSeg = timelineSegments.find(
      (s) => wordSourceTime >= s.sourceStart && wordSourceTime < s.sourceEnd
    );
    if (!timelineSeg) return;

    const offsetInSegment = wordSourceTime - timelineSeg.sourceStart;
    const targetFrame = timelineSeg.startFrame + secondsToFrames(offsetInSegment);
    seekToFrame(targetFrame, true);
  }, [timelineSegments, seekToFrame]);

  // Handle word toggle - now needs sentenceId
  const handleToggleWord = useCallback((sentenceId: string, wordId: string) => {
    toggleWordExcluded(sentenceId, wordId);
  }, [toggleWordExcluded]);

  // Handle clearing video override (B-roll removal)
  const handleClearVideoOverride = useCallback((sentenceId: string) => {
    clearVideoOverride(sentenceId);
  }, []);

  // Register sentence ref for scroll tracking
  const registerSentenceRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      sentenceRefs.current.set(id, el);
    } else {
      sentenceRefs.current.delete(id);
    }
  }, []);

  if (entriesWithSentences.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        No transcript sentences
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto px-6 py-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-0.5">
            {entriesWithSentences.map(({ entry, sentence }) => {
              const isExcluded = entry.excluded;
              const isMoved = movedSentenceIds.has(sentence.sentenceId);
              const sourceColor = sourceColors.get(sentence.sourceId) || SOURCE_COLORS[0];
              // Build excluded word set for this entry
              const excludedWordSet = new Set(entry.excludedWordIds);
              // Get description for this sentence (if any)
              const description = sentenceDescriptions.get(sentence.sentenceId);
              // Get B-roll classification for this sentence (if any)
              const brollClassification = brollClassifications.get(sentence.sentenceId);
              return (
                <div
                  key={sentence.sentenceId}
                  ref={(el) => registerSentenceRef(sentence.sentenceId, el)}
                >
                  <SentenceItem
                    sentence={sentence}
                    words={words}
                    excludedWordIds={excludedWordSet}
                    selectedWordId={selectedWordId}
                    isExcluded={isExcluded}
                    isMoved={isMoved}
                    sourceColor={sourceColor}
                    description={description}
                    brollClassification={brollClassification}
                    videoOverride={entry.videoOverride}
                    brollSourceName={entry.videoOverride ? sourceNameMap.get(entry.videoOverride.sourceId) : undefined}
                    currentSourceTime={
                      !isExcluded && activePlayback?.sentenceId === sentence.sentenceId
                        ? activePlayback.sourceTime
                        : null
                    }
                    onSelect={() => handleSentenceSelect(sentence)}
                    onDelete={() => handleSentenceDelete(sentence.sentenceId)}
                    onRestore={() => handleSentenceRestore(sentence.sentenceId)}
                    onToggleWord={(wordId) => handleToggleWord(sentence.sentenceId, wordId)}
                    onSelectWord={handleSelectWord}
                    onSeekToWord={handleSeekToWord}
                    onClearVideoOverride={() => handleClearVideoOverride(sentence.sentenceId)}
                  />
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
