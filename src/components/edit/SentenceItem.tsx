import { useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DotsSixVertical, X, ArrowCounterClockwise } from "@phosphor-icons/react";
import { WordSpan } from "./WordSpan";
import type { Word, Sentence, BrollClassification, VideoOverride } from "../../types";
import { formatTime } from "../../stores/usePlaybackStore";

interface WordData {
  wordId: string;
  word: string;
  start: number;
  end: number;
}

interface SentenceItemProps {
  sentence: Sentence;
  words: Word[];
  excludedWordIds: Set<string>;
  selectedWordId: string | null;
  isExcluded: boolean;
  isMoved: boolean;
  sourceColor: string;
  description?: string;
  brollClassification?: BrollClassification;
  videoOverride?: VideoOverride;
  brollSourceName?: string; // Display name for the B-roll source
  currentSourceTime: number | null;
  onSelect: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onToggleWord: (wordId: string) => void;
  onSelectWord: (wordId: string) => void;
  onSeekToWord: (sourceTime: number) => void;
  onClearVideoOverride?: () => void;
}

export function SentenceItem({
  sentence,
  words: wordsList,
  excludedWordIds,
  selectedWordId,
  isExcluded,
  isMoved,
  sourceColor,
  description,
  brollClassification,
  videoOverride,
  brollSourceName,
  currentSourceTime,
  onSelect,
  onDelete,
  onRestore,
  onToggleWord,
  onSelectWord,
  onSeekToWord,
  onClearVideoOverride,
}: SentenceItemProps) {
  const isBroll = brollClassification?.isBroll ?? false;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sentence.sentenceId,
    disabled: isExcluded,
  });

  // Use dnd-kit's CSS transform helper for drag animations
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const words = useMemo((): WordData[] => {
    const sentenceWords = sentence.wordIds
      .map((id) => wordsList.find((w) => w.id === id))
      .filter((w): w is Word => w !== undefined);

    if (sentenceWords.length === 0) {
      return [{
        wordId: "",
        word: sentence.text,
        start: sentence.startTime,
        end: sentence.endTime,
      }];
    }

    return sentenceWords.map((w) => ({
      wordId: w.id,
      word: w.word,
      start: w.start,
      end: w.end,
    }));
  }, [sentence, wordsList]);

  const isWordActive = (word: WordData): boolean => {
    if (currentSourceTime === null) return false;
    if (excludedWordIds.has(word.wordId)) return false;
    return currentSourceTime >= word.start && currentSourceTime < word.end;
  };

  const handleClick = () => {
    if (isExcluded) {
      onRestore();
    } else {
      onSelect();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative flex items-center gap-3 px-3 py-2 -mx-3 rounded-md
        transition-colors transition-opacity duration-200 ease-out
        ${isDragging
          ? "bg-neutral-800/50 opacity-80 scale-[0.98] shadow-lg"
          : isExcluded
            ? "opacity-50"
            : ""
        }
      `}
      onClick={handleClick}
    >
      {/* Source color bar - vertical tag on left edge */}
      <div
        className="absolute left-0 top-1 bottom-1 w-1 rounded-full transition-opacity duration-150"
        style={{
          backgroundColor: sourceColor,
          opacity: isExcluded ? 0.3 : 0.8,
        }}
      />

      {/* Drag handle */}
      {!isExcluded && (
        <div
          {...attributes}
          {...listeners}
          className="
            absolute left-3 top-1/2 -translate-y-1/2
            opacity-0 group-hover:opacity-100
            -translate-x-1 group-hover:translate-x-0
            cursor-grab active:cursor-grabbing
            text-neutral-500 hover:text-neutral-300
            transition-all duration-150 ease-out
          "
        >
          <DotsSixVertical size={18} weight="bold" />
        </div>
      )}

      {/* Timestamp - highlighted if moved */}
      <span className={`
        w-12 shrink-0 text-xs font-mono select-none ml-6
        transition-colors duration-150
        ${isExcluded
          ? "text-neutral-600"
          : isMoved
            ? "text-amber-400 font-medium"
            : "text-neutral-500"
        }
      `}>
        {formatTime(sentence.startTime)}
      </span>

      {/* Sentence text with optional description */}
      <div className={`
        flex-1 min-w-0
        ${isExcluded ? "text-neutral-500 line-through decoration-neutral-600" : ""}
      `}>
        {/* Screenplay-style description (only show if not B-roll, since B-roll shows its own description) */}
        {description && !isExcluded && !isBroll && (
          <div className="text-[12px] text-neutral-400 italic font-sans mb-1 select-none">
            [{description}]
          </div>
        )}
        {/* Video override indicator - clickable to remove B-roll */}
        {videoOverride && !isExcluded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClearVideoOverride?.();
            }}
            className="text-[12px] text-violet-400 italic font-sans mb-1 select-none
                       hover:text-violet-300 transition-colors cursor-pointer
                       flex items-center gap-1"
            title="Click to remove B-roll video override"
          >
            <span className="text-violet-500">[B-Roll:</span>
            <span>{brollSourceName || videoOverride.sourceId}</span>
            <span className="text-neutral-500">
              {videoOverride.start.toFixed(1)}s-{videoOverride.end.toFixed(1)}s
            </span>
            <span className="text-violet-500">]</span>
            <X size={12} weight="bold" className="opacity-60 hover:opacity-100" />
          </button>
        )}
        {/* Sentence text or B-roll indicator */}
        <div className="text-[14px] leading-relaxed font-mono font-light">
          {isExcluded ? (
            <span className="cursor-pointer">{sentence.text}</span>
          ) : isBroll ? (
            <span className="italic text-neutral-400">
              {description ? `B-Roll — ${description}` : "B-Roll"}
            </span>
          ) : (
            words.map((w, idx) => (
              <WordSpan
                key={w.wordId || idx}
                word={w.word}
                isExcluded={w.wordId ? excludedWordIds.has(w.wordId) : false}
                isActive={isWordActive(w)}
                isSelected={w.wordId === selectedWordId}
                isLastWord={idx === words.length - 1}
                isInteractive={!!w.wordId}
                onSelect={() => w.wordId && onSelectWord(w.wordId)}
                onSeek={() => onSeekToWord(w.start)}
                onDoubleClick={() => {
                  if (w.wordId) {
                    onToggleWord(w.wordId);
                  }
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* Action buttons */}
      {isExcluded ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRestore();
          }}
          className="
            opacity-0 group-hover:opacity-100
            scale-90 group-hover:scale-100 hover:scale-110 active:scale-95
            text-neutral-500 hover:text-green-400
            transition-all duration-150 ease-out
          "
          title="Restore"
        >
          <ArrowCounterClockwise size={16} weight="bold" />
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="
            opacity-0 group-hover:opacity-100
            scale-90 group-hover:scale-100 hover:scale-110 active:scale-95
            text-neutral-500 hover:text-red-400
            transition-all duration-150 ease-out
          "
          title="Delete"
        >
          <X size={16} weight="bold" />
        </button>
      )}
    </div>
  );
}
