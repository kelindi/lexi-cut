import { useState, useCallback, useEffect } from "react";
import { useProjectStore } from "../stores/useProjectStore";
import { useSourcesStore } from "../stores/useSourcesStore";

export function useSaveProject() {
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = useProjectStore((s) => s.isDirty);
  const saveProject = useProjectStore((s) => s.saveProject);
  const sources = useSourcesStore((s) => s.sources);

  const save = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await saveProject(sources);
    } catch (error) {
      console.error("Failed to save project:", error);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, saveProject, sources]);

  // Keyboard shortcut: Cmd+S (Mac) / Ctrl+S (Windows/Linux)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        // Still allow save shortcut in input fields - it's a common expectation
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && !isSaving) {
          save();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, isSaving, save]);

  return {
    save,
    isSaving,
    isDirty,
  };
}
