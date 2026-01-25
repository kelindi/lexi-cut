import { useEffect, useState } from "react";
import { Plus, FolderOpen, X } from "@phosphor-icons/react";
import { Quantum } from "ldrs/react";
import "ldrs/react/Quantum.css";
import { useProjectStore } from "../stores/useProjectStore";
import { loadProjects, saveProjects } from "../api/projects";
import type { ProjectMeta } from "../types";

export function ProjectsPage() {
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ProjectMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
      await openProject(id, trimmed);
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

  const handleDelete = async (project: ProjectMeta) => {
    const updated = projects.filter((p) => p.id !== project.id);
    try {
      await saveProjects(updated);
      setProjects(updated);
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Failed to delete project:", err);
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
      {/* Content */}
      <div className="flex-1 px-8 py-10">
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
              <div
                key={project.id}
                className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-white/10 bg-[#0d0d0d] transition-all hover:border-white/20"
              >
                {/* Clickable area */}
                <button
                  onClick={async () => {
                    setIsLoading(true);
                    try {
                      await openProject(project.id, project.name);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading}
                  className="absolute inset-0 text-left"
                >
                  {/* Full cell background */}
                  {project.thumbnail ? (
                    <img
                      src={project.thumbnail}
                      alt={project.name}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <FolderOpen
                        size={48}
                        weight="duotone"
                        className="text-white/10 transition-colors group-hover:text-white/20"
                      />
                    </div>
                  )}
                  {/* Info overlay at bottom */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-3 pb-2 pt-6">
                    <span className="block truncate text-sm font-medium text-white">
                      {project.name}
                    </span>
                    <span className="block text-xs text-white/50">
                      {formatDate(project.createdAt)}
                    </span>
                  </div>
                </button>
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(project);
                  }}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/50 opacity-0 transition-all hover:bg-red-500/80 hover:text-white group-hover:opacity-100"
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
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

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="mx-4 w-full max-w-sm rounded-lg border border-white/10 bg-[#111] p-6">
            <h3 className="text-lg font-semibold text-white">Delete Project</h3>
            <p className="mt-2 text-sm text-white/60">
              Are you sure you want to delete "{deleteConfirm.name}"? This
              action cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]">
          <Quantum size="80" speed="1.75" color="white" />
        </div>
      )}
    </main>
  );
}
