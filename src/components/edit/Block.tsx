import { useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DotsSixVertical, X } from "@phosphor-icons/react";
import type { Segment, SegmentGroup } from "../../types";
import { formatTime } from "../../stores/usePlaybackStore";

interface WordWithTimestamp {
  word: string;
  start: number;
  end: number;
}

interface SentenceWithTimestamp {
  words: WordWithTimestamp[];
  startTime: number;
}

interface BlockProps {
  group: SegmentGroup;
  segments: Segment[];
  isSelected: boolean;
  currentSourceTime: number | null; // null if this block isn't playing
  onSelect: () => void;
  onDelete: () => void;
  onTextChange: (text: string) => void;
  onWordClick: (sourceTime: number) => void;
}

export function Block({
  group,
  segments,
  isSelected,
  currentSourceTime,
  onSelect,
  onDelete,
  onTextChange,
  onWordClick,
}: BlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: group.groupId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Build sentences with word-level timestamps from individual segments
  const sentences = useMemo((): SentenceWithTimestamp[] => {
    // Get segments for this group in order
    const groupSegments = group.segmentIds
      .map((id) => segments.find((s) => s.id === id))
      .filter((s): s is Segment => s !== undefined && s.text !== undefined);

    if (groupSegments.length === 0) {
      // Fallback: single sentence with group timestamp
      return [{
        words: [{ word: group.text, start: group.startTime, end: group.endTime }],
        startTime: group.startTime,
      }];
    }

    const result: SentenceWithTimestamp[] = [];
    let currentWords: WordWithTimestamp[] = [];
    let sentenceStartTime: number | null = null;

    for (const seg of groupSegments) {
      const text = seg.text!;
      const wordData: WordWithTimestamp = {
        word: text.word,
        start: text.start,
        end: text.end,
      };

      if (sentenceStartTime === null) {
        sentenceStartTime = text.start;
      }

      currentWords.push(wordData);

      // Check if this word ends a sentence
      if (/[.!?]$/.test(text.word.trim())) {
        result.push({
          words: currentWords,
          startTime: sentenceStartTime,
        });
        currentWords = [];
        sentenceStartTime = null;
      }
    }

    // Add any remaining words as final sentence
    if (currentWords.length > 0 && sentenceStartTime !== null) {
      result.push({
        words: currentWords,
        startTime: sentenceStartTime,
      });
    }

    return result.length > 0
      ? result
      : [{
          words: [{ word: group.text, start: group.startTime, end: group.endTime }],
          startTime: group.startTime,
        }];
  }, [group, segments]);

  // Check if a word is currently being spoken
  const isWordActive = (word: WordWithTimestamp): boolean => {
    if (currentSourceTime === null) return false;
    return currentSourceTime >= word.start && currentSourceTime < word.end;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 border border-neutral-800 p-2 ${
        isSelected ? "bg-neutral-900 border-neutral-600" : "hover:bg-neutral-950"
      }`}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="mt-0.5 cursor-grab text-neutral-600 hover:text-white active:cursor-grabbing"
      >
        <DotsSixVertical size={16} />
      </div>

      {/* Sentences with timestamps */}
      <div className="flex-1 min-w-0">
        {sentences.map((sentence, idx) => (
          <div key={idx} className="flex gap-2 mb-1 last:mb-0">
            <span className="w-12 shrink-0 text-xs font-mono text-neutral-500 pt-0.5">
              {formatTime(sentence.startTime)}
            </span>
            <span className="text-sm text-white break-words">
              {sentence.words.map((w, wIdx) => (
                <span
                  key={wIdx}
                  className={`cursor-pointer hover:text-yellow-200 ${
                    isWordActive(w) ? "font-bold text-yellow-400" : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onWordClick(w.start);
                  }}
                >
                  {w.word}
                  {wIdx < sentence.words.length - 1 ? " " : ""}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="mt-0.5 text-neutral-600 hover:text-red-500"
      >
        <X size={14} />
      </button>
    </div>
  );
}
