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
import { usePlaybackStore, secondsToFrames, framesToSeconds } from "../../stores/usePlaybackStore";
import { useTimelineSegments } from "../../hooks/useTimelineSegments";
import type { Sentence } from "../../types";

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
  // Project state
  const orderedSentenceIds = useProjectStore((s) => s.orderedSentenceIds);
  const excludedSentenceIds = useProjectStore((s) => s.excludedSentenceIds);
  const excludedWordIds = useProjectStore((s) => s.excludedWordIds);
  const sentences = useProjectStore((s) => s.sentences);
  const words = useProjectStore((s) => s.words);
  const reorderSentences = useProjectStore((s) => s.reorderSentences);
  const excludeSentence = useProjectStore((s) => s.excludeSentence);
  const restoreSentence = useProjectStore((s) => s.restoreSentence);
  const toggleWordExclusion = useProjectStore((s) => s.toggleWordExclusion);

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

  // Memoize excluded sets
  const excludedSentenceSet = useMemo(
    () => new Set(excludedSentenceIds),
    [excludedSentenceIds]
  );

  const excludedWordSet = useMemo(
    () => new Set(excludedWordIds),
    [excludedWordIds]
  );

  // All sentences in display order
  const allSentences = useMemo((): Sentence[] => {
    return orderedSentenceIds
      .map((id) => sentences.find((s) => s.sentenceId === id)!)
      .filter(Boolean);
  }, [orderedSentenceIds, sentences]);

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

    // Get non-excluded sentences in current order
    const currentOrder = orderedSentenceIds.filter(id => !excludedSentenceSet.has(id));

    // Group sentences by source
    const sentencesBySource = new Map<string, string[]>();
    for (const id of currentOrder) {
      const sentence = sentences.find(s => s.sentenceId === id);
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
        const sentA = sentences.find(s => s.sentenceId === a);
        const sentB = sentences.find(s => s.sentenceId === b);
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
  }, [orderedSentenceIds, excludedSentenceSet, sentences]);

  // Only non-excluded sentence IDs for sortable context
  const sortableIds = useMemo(
    () => allSentences
      .filter((s) => !excludedSentenceSet.has(s.sentenceId))
      .map((s) => s.sentenceId),
    [allSentences, excludedSentenceSet]
  );

  // Compute active playback state (which sentence/word is playing)
  const activePlayback = useMemo(() => {
    for (const seg of timelineSegments) {
      if (currentFrame >= seg.startFrame && currentFrame < seg.startFrame + seg.durationFrames) {
        const offsetFrames = currentFrame - seg.startFrame;
        const offsetSeconds = framesToSeconds(offsetFrames);
        const sourceTime = seg.sourceStart + offsetSeconds;

        // Find which sentence is active
        let activeSentenceId = seg.sentenceIds[0];
        for (const sentenceId of seg.sentenceIds) {
          const sentence = sentences.find((s) => s.sentenceId === sentenceId);
          if (sentence && sourceTime >= sentence.startTime && sourceTime < sentence.endTime) {
            activeSentenceId = sentenceId;
            break;
          }
        }

        return { sentenceId: activeSentenceId, sourceTime };
      }
    }
    return null;
  }, [currentFrame, timelineSegments, sentences]);

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

    const oldIndex = orderedSentenceIds.indexOf(active.id as string);
    const newIndex = orderedSentenceIds.indexOf(over.id as string);

    if (oldIndex !== -1 && newIndex !== -1) {
      reorderSentences(oldIndex, newIndex);
    }
  }, [orderedSentenceIds, reorderSentences]);

  // Handle sentence selection and seek
  const handleSentenceSelect = useCallback((sentence: Sentence) => {
    selectSentence(sentence.sentenceId);

    // Calculate frame position for this sentence
    let framePosition = 0;
    for (const id of orderedSentenceIds) {
      if (excludedSentenceSet.has(id)) continue;
      if (id === sentence.sentenceId) break;
      const s = sentences.find((sent) => sent.sentenceId === id);
      if (s) {
        framePosition += secondsToFrames(s.endTime - s.startTime);
      }
    }
    seekToFrame(framePosition);
  }, [orderedSentenceIds, excludedSentenceSet, sentences, selectSentence, seekToFrame]);

  // Handle sentence deletion
  const handleSentenceDelete = useCallback((sentenceId: string) => {
    excludeSentence(sentenceId);
    if (selectedSentenceId === sentenceId) {
      selectSentence(null);
    }
  }, [excludeSentence, selectedSentenceId, selectSentence]);

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

  // Register sentence ref for scroll tracking
  const registerSentenceRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      sentenceRefs.current.set(id, el);
    } else {
      sentenceRefs.current.delete(id);
    }
  }, []);

  if (allSentences.length === 0) {
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
            {allSentences.map((sentence) => {
              const isExcluded = excludedSentenceSet.has(sentence.sentenceId);
              const isMoved = movedSentenceIds.has(sentence.sentenceId);
              const sourceColor = sourceColors.get(sentence.sourceId) || SOURCE_COLORS[0];
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
                    currentSourceTime={
                      !isExcluded && activePlayback?.sentenceId === sentence.sentenceId
                        ? activePlayback.sourceTime
                        : null
                    }
                    onSelect={() => handleSentenceSelect(sentence)}
                    onDelete={() => handleSentenceDelete(sentence.sentenceId)}
                    onRestore={() => restoreSentence(sentence.sentenceId)}
                    onToggleWord={toggleWordExclusion}
                    onSelectWord={handleSelectWord}
                    onSeekToWord={handleSeekToWord}
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
