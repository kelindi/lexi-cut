import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { ArrowRight, X, VideoCamera } from "@phosphor-icons/react";
import { UploadCard } from "../components";
import { useSourcesStore } from "../stores";
import { generateCid } from "../utils/cid";
import { generateThumbnail } from "../utils/video";
import { transcribeSourceBackground, describeSourceBackground } from "../api/backgroundProcessing";
import type { Source } from "../types";

interface AddClipsPageProps {
  onNext?: () => void;
}

function formatDuration(seconds?: number): string {
  if (seconds === undefined) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AddClipsPage({ onNext }: AddClipsPageProps) {
  const { sources, addSources, updateSourceCid, removeSource } =
    useSourcesStore();

  const handleSelectFiles = async () => {
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: "Video",
          extensions: ["mp4", "mov", "MP4", "MOV"],
        },
      ],
    });

    if (!selected || selected.length === 0) return;

    const paths = Array.isArray(selected) ? selected : [selected];

    const newSources = await Promise.all(
      paths.map(async (path) => {
        const [thumbnail, duration, dimensions] = await Promise.all([
          generateThumbnail(path),
          invoke<number>("get_duration", { videoPath: path }).catch(() => undefined),
          invoke<{ width: number; height: number }>("get_dimensions", { videoPath: path }).catch(() => undefined),
        ]);
        const name = path.split("/").pop() || path;
        return {
          id: crypto.randomUUID(),
          name,
          thumbnail,
          path,
          duration,
          width: dimensions?.width,
          height: dimensions?.height,
        } as Source;
      }),
    );

    addSources(newSources);

    // Generate CIDs in background after sources are added, then start processing
    newSources.forEach((source) => {
      generateCid(source.path).then((cid) => {
        updateSourceCid(source.id, cid);

        // Start background processing immediately (fire and forget)
        transcribeSourceBackground(source.path, cid);
        describeSourceBackground(source.path, source.duration, cid);
      });
    });
  };

  const hasClips = sources.length > 0;

  return (
    <main className="flex min-h-[calc(100vh-3rem)] flex-col bg-[#0a0a0a]">
      <div className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-4xl">
          {/* Section Title */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-white/40">
              Clips
            </h2>
            {hasClips && (
              <span className="text-sm text-white/40">
                {sources.length} {sources.length === 1 ? "clip" : "clips"}
              </span>
            )}
          </div>

          {/* Clips Grid */}
          <div className="stagger-grid grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {/* Upload Card */}
            <UploadCard onClick={handleSelectFiles} />

            {/* Existing Clips */}
            {sources.map((source) => (
              <div
                key={source.id}
                className="card-hover group relative aspect-[4/3] overflow-hidden rounded-lg border border-white/10 bg-[#0d0d0d]"
              >
                {/* Thumbnail */}
                {source.thumbnail ? (
                  <img
                    src={source.thumbnail}
                    alt={source.name}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <VideoCamera
                      size={48}
                      weight="duotone"
                      className="text-white/10 transition-colors group-hover:text-white/20"
                    />
                  </div>
                )}

                {/* Info overlay at bottom */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-3 pb-2 pt-6">
                  <span className="block truncate text-sm font-medium text-white">
                    {source.name}
                  </span>
                  {source.duration && (
                    <span className="block text-xs text-white/50">
                      {formatDuration(source.duration)}
                    </span>
                  )}
                </div>

                {/* Delete button */}
                <button
                  onClick={() => removeSource(source.id)}
                  className="delete-glow absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/50 opacity-0 transition-all hover:bg-red-500/80 hover:text-white group-hover:opacity-100"
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
            ))}

            {/* Next Card - inline after clips */}
            {hasClips && (
              <button
                onClick={onNext}
                className="btn-press card-hover group flex aspect-[4/3] flex-col items-center justify-center rounded-lg border border-white/20 bg-[#1a1a1a]"
              >
                <ArrowRight
                  size={32}
                  weight="bold"
                  className="text-white/50 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-white/70"
                />
                <span className="mt-2 text-sm font-medium text-white/50 transition-colors group-hover:text-white/70">
                  Next
                </span>
              </button>
            )}
          </div>

          {/* Empty State */}
          {!hasClips && (
            <div className="mt-10 flex flex-col items-center justify-center text-center">
              <VideoCamera
                size={48}
                weight="duotone"
                className="text-white/20"
              />
              <p className="mt-4 text-sm text-white/40">
                Add video clips to get started.
              </p>
            </div>
          )}
        </div>
      </div>

    </main>
  );
}
