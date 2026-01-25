import { useEffect, useState } from "react";
import { Plus, FolderOpen, FilmStrip } from "@phosphor-icons/react";
import { useProjectStore } from "../stores/useProjectStore";
import { loadProjects, saveProjects } from "../api/projects";
import type { ProjectMeta } from "../types";

export function ProjectsPage() {
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const openProject = useProjectStore((s) => s.openProject);

  useEffect(() => {
    loadProjects().then(setProjects).catch(console.error);
  }, []);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const id = crypto.randomUUID();
    const meta: ProjectMeta = { id, name: trimmed, createdAt: Date.now() };
    const updated = [meta, ...projects];
    try {
      await saveProjects(updated);
      setProjects(updated);
      openProject(id, trimmed);
      setName("");
      setIsCreating(false);
    } catch (err) {
      console.error("Failed to create project:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCreate();
    } else if (e.key === "Escape") {
      setIsCreating(false);
      setName("");
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/5 px-8 py-6">
        <div className="flex items-center gap-3">
          <FilmStrip size={28} weight="duotone" className="text-white/80" />
          <h1 className="text-xl font-semibold text-white">Lexi Cut</h1>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-4xl">
          {/* Section Title */}
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-white/40">
              Projects
            </h2>
          </div>

          {/* Projects Grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {/* New Project Card */}
            {isCreating ? (
              <div className="flex aspect-[4/3] flex-col overflow-hidden rounded-lg border border-white/20 bg-[#111]">
                <div className="flex flex-1 items-center justify-center p-4">
                  <FolderOpen
                    size={32}
                    weight="duotone"
                    className="text-white/30"
                  />
                </div>
                <div className="border-t border-white/10 p-3">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={() => {
                      if (!name.trim()) {
                        setIsCreating(false);
                      }
                    }}
                    placeholder="Project name"
                    autoFocus
                    className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none"
                  />
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="group flex aspect-[4/3] flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-[#111] transition-all hover:border-white/20 hover:bg-[#151515]"
              >
                <Plus
                  size={32}
                  weight="light"
                  className="text-white/30 transition-colors group-hover:text-white/50"
                />
                <span className="mt-2 text-xs text-white/30 transition-colors group-hover:text-white/50">
                  New Project
                </span>
              </button>
            )}

            {/* Existing Projects */}
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => openProject(project.id, project.name)}
                className="group flex aspect-[4/3] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#111] text-left transition-all hover:border-white/20 hover:bg-[#151515]"
              >
                {/* Thumbnail area */}
                <div className="flex flex-1 items-center justify-center">
                  {project.thumbnail ? (
                    <img
                      src={project.thumbnail}
                      alt={project.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FolderOpen
                      size={32}
                      weight="duotone"
                      className="text-white/20 transition-colors group-hover:text-white/30"
                    />
                  )}
                </div>
                {/* Info */}
                <div className="border-t border-white/5 px-3 py-2">
                  <span className="block truncate text-sm font-medium text-white">
                    {project.name}
                  </span>
                  <span className="block text-xs text-white/40">
                    {formatDate(project.createdAt)}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Empty State */}
          {projects.length === 0 && !isCreating && (
            <div className="mt-16 flex flex-col items-center justify-center text-center">
              <FolderOpen
                size={48}
                weight="duotone"
                className="text-white/20"
              />
              <p className="mt-4 text-sm text-white/40">
                No projects yet. Create your first project to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
