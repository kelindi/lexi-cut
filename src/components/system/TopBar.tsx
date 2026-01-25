import { CaretLeft } from "@phosphor-icons/react";
import { useProjectStore } from "../../stores/useProjectStore";

export function TopBar() {
  const projectName = useProjectStore((s) => s.projectName);
  const closeProject = useProjectStore((s) => s.closeProject);

  return (
    <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-white/5 bg-[#0a0a0a] px-4">
      <button
        onClick={closeProject}
        className="flex items-center gap-1 text-white/50 transition-colors hover:text-white"
      >
        <CaretLeft size={20} weight="bold" />
      </button>
      <span className="text-sm font-medium text-white">{projectName}</span>
    </header>
  );
}
