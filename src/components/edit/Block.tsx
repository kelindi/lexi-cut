import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DotsSixVertical, X } from "@phosphor-icons/react";
import type { SegmentGroup } from "../../types";
import { formatTime } from "../../stores/usePlaybackStore";

interface BlockProps {
  group: SegmentGroup;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTextChange: (text: string) => void;
}

export function Block({
  group,
  isSelected,
  onSelect,
  onDelete,
  onTextChange,
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 border border-neutral-800 p-3 ${
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

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          contentEditable
          suppressContentEditableWarning
          className="text-sm text-white outline-none break-words"
          onBlur={(e) => {
            const newText = e.currentTarget.textContent || "";
            if (newText !== group.text) {
              onTextChange(newText);
            }
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {group.text}
        </div>
        <div className="mt-1 text-xs text-neutral-500">
          {formatTime(group.startTime)} – {formatTime(group.endTime)}
        </div>
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
