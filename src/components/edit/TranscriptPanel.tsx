import { useCallback, useEffect } from "react";
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
import { Block } from "./Block";
import { useProjectStore } from "../../stores/useProjectStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { usePlaybackStore, secondsToFrames } from "../../stores/usePlaybackStore";
import type { SegmentGroup } from "../../types";

export function TranscriptPanel() {
  const orderedGroupIds = useProjectStore((s) => s.orderedGroupIds);
  const excludedGroupIds = useProjectStore((s) => s.excludedGroupIds);
  const segmentGroups = useProjectStore((s) => s.segmentGroups);
  const reorderGroups = useProjectStore((s) => s.reorderGroups);
  const excludeGroup = useProjectStore((s) => s.excludeGroup);
  const updateGroupText = useProjectStore((s) => s.updateGroupText);

  const selectedBlockId = useSelectionStore((s) => s.selectedBlockId);
  const selectBlock = useSelectionStore((s) => s.selectBlock);

  const seekToFrame = usePlaybackStore((s) => s.seekToFrame);

  // Build list of visible groups in order
  const excludedSet = new Set(excludedGroupIds);
  const visibleGroups: SegmentGroup[] = orderedGroupIds
    .filter((id) => !excludedSet.has(id))
    .map((id) => segmentGroups.find((g) => g.groupId === id)!)
    .filter(Boolean);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = orderedGroupIds.indexOf(active.id as string);
      const newIndex = orderedGroupIds.indexOf(over.id as string);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderGroups(oldIndex, newIndex);
      }
    },
    [orderedGroupIds, reorderGroups]
  );

  const handleBlockSelect = useCallback(
    (group: SegmentGroup) => {
      selectBlock(group.groupId);

      // Calculate frame position for this group
      let framePosition = 0;
      for (const id of orderedGroupIds) {
        if (excludedSet.has(id)) continue;
        if (id === group.groupId) break;
        const g = segmentGroups.find((sg) => sg.groupId === id);
        if (g) {
          framePosition += secondsToFrames(g.endTime - g.startTime);
        }
      }
      seekToFrame(framePosition);
    },
    [orderedGroupIds, excludedSet, segmentGroups, selectBlock, seekToFrame]
  );

  const handleBlockDelete = useCallback(
    (groupId: string) => {
      excludeGroup(groupId);
      if (selectedBlockId === groupId) {
        selectBlock(null);
      }
    },
    [excludeGroup, selectedBlockId, selectBlock]
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedBlockId) return;

      const currentIndex = visibleGroups.findIndex(
        (g) => g.groupId === selectedBlockId
      );

      if (e.key === "ArrowUp" && currentIndex > 0) {
        e.preventDefault();
        handleBlockSelect(visibleGroups[currentIndex - 1]);
      } else if (e.key === "ArrowDown" && currentIndex < visibleGroups.length - 1) {
        e.preventDefault();
        handleBlockSelect(visibleGroups[currentIndex + 1]);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedBlockId) {
        // Only delete if not editing text
        const activeEl = document.activeElement;
        if (activeEl?.getAttribute("contenteditable") !== "true") {
          e.preventDefault();
          handleBlockDelete(selectedBlockId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedBlockId, visibleGroups, handleBlockSelect, handleBlockDelete]);

  if (visibleGroups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        No transcript blocks
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visibleGroups.map((g) => g.groupId)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {visibleGroups.map((group) => (
              <Block
                key={group.groupId}
                group={group}
                isSelected={selectedBlockId === group.groupId}
                onSelect={() => handleBlockSelect(group)}
                onDelete={() => handleBlockDelete(group.groupId)}
                onTextChange={(text) => updateGroupText(group.groupId, text)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
