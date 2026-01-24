import { memo, useRef } from "react";

interface WordSpanProps {
  word: string;
  isExcluded: boolean;
  isActive: boolean;
  isSelected: boolean;
  isLastWord: boolean;
  isInteractive?: boolean; // Whether double-click to exclude is enabled
  onSelect: () => void;
  onSeek: () => void;
  onDoubleClick: () => void;
}

/**
 * Individual word span with exclusion and playback states.
 * Uses CSS transitions for colors, opacity, and scale - no motion library needed.
 */
export const WordSpan = memo(function WordSpan({
  word,
  isExcluded,
  isActive,
  isSelected,
  isLastWord,
  isInteractive = true,
  onSelect,
  onSeek,
  onDoubleClick,
}: WordSpanProps) {
  const clickTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();

    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current);
    }
    clickTimeout.current = setTimeout(() => {
      onSeek();
      clickTimeout.current = null;
    }, 200);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
    }
    // Only allow exclusion if interactive (has real word IDs)
    if (isInteractive) {
      onDoubleClick();
    }
  };

  // All styling via Tailwind - colors, opacity, and scale
  const stateClass = isExcluded
    ? "text-neutral-500 line-through decoration-neutral-500 opacity-60"
    : isSelected
      ? "text-blue-400 font-semibold scale-[1.03]"
      : isActive
        ? "text-blue-400 font-medium scale-[1.01]"
        : "text-neutral-100 hover:text-white hover:-translate-y-px";

  return (
    <>
      <span
        className={`
          cursor-pointer select-none inline origin-center
          transition-colors transition-transform duration-150 ease-out
          ${stateClass}
        `}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {word}
      </span>
      {!isLastWord && " "}
    </>
  );
});
