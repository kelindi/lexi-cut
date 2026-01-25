import { useState } from "react";
import { CaretLeft, FloppyDisk, Circle } from "@phosphor-icons/react";
import { useProjectStore } from "../../stores/useProjectStore";
import { useSourcesStore } from "../../stores/useSourcesStore";

export function TopBar() {
  const projectName = useProjectStore((s) => s.projectName);
  const closeProject = useProjectStore((s) => s.closeProject);
  const isDirty = useProjectStore((s) => s.isDirty);
  const saveProject = useProjectStore((s) => s.saveProject);
  const sources = useSourcesStore((s) => s.sources);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    try {
      await saveProject(sources);
    } catch (error) {
      console.error("Failed to save project:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      closeProject();
    }
  };

  const handleSaveAndExit = async () => {
    await handleSave();
    closeProject();
  };

  const handleDiscardAndExit = () => {
    closeProject();
  };

  return (
    <>
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-white/5 bg-[#0a0a0a] px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-white/50 transition-colors hover:text-white"
          >
            <CaretLeft size={20} weight="bold" />
          </button>
          <span className="text-sm font-medium text-white">{projectName}</span>
          {isDirty && (
            <Circle size={8} weight="fill" className="text-orange-400" />
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors ${
            isDirty && !isSaving
              ? "text-white hover:bg-white/10"
              : "text-white/30 cursor-not-allowed"
          }`}
        >
          <FloppyDisk size={18} />
          <span className="text-sm">{isSaving ? "Saving..." : "Save"}</span>
        </button>
      </header>

      {/* Unsaved Changes Confirmation Modal */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="mx-4 w-full max-w-sm rounded-lg border border-white/10 bg-[#111] p-6">
            <h3 className="text-lg font-semibold text-white">Unsaved Changes</h3>
            <p className="mt-2 text-sm text-white/60">
              You have unsaved changes. Would you like to save before leaving?
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={handleSaveAndExit}
                className="w-full rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90"
              >
                Save & Exit
              </button>
              <button
                onClick={handleDiscardAndExit}
                className="w-full rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/5"
              >
                Discard Changes
              </button>
              <button
                onClick={() => setShowExitConfirm(false)}
                className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white/50 transition-colors hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
