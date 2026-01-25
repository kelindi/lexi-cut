import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { ArrowRight, X } from "@phosphor-icons/react";
import { UploadCard } from "../components";
import { useSourcesStore } from "../stores";
import { generateCid } from "../utils/cid";
import { generateThumbnail } from "../utils/video";
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
        const [thumbnail, duration] = await Promise.all([
          generateThumbnail(path),
          invoke<number>("get_duration", { videoPath: path }).catch(() => undefined),
        ]);
        const name = path.split("/").pop() || path;
        return {
          id: crypto.randomUUID(),
          name,
          thumbnail,
          path,
          duration,
        } as Source;
      }),
    );

    addSources(newSources);

    // Generate CIDs in background after sources are added
    newSources.forEach((source) => {
      generateCid(source.path).then((cid) => {
        updateSourceCid(source.id, cid);
      });
    });
  };

  const hasClips = sources.length > 0;

  return (
    <main className="flex min-h-[calc(100vh-3rem)] flex-col bg-[#0a0a0a]">
      <div className="flex flex-1 flex-col items-center px-8 py-12">
        {/* Upload card */}
        <div className="w-full max-w-md">
          <UploadCard onClick={handleSelectFiles} />
        </div>

        {/* File list */}
        {hasClips && (
          <div className="mt-10 w-full max-w-2xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-neutral-400">
                {sources.length} {sources.length === 1 ? "clip" : "clips"} selected
              </span>
            </div>
            <div className="space-y-2">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center gap-4 rounded-lg bg-[#111] p-3"
                >
                  {/* Thumbnail */}
                  <div className="h-12 w-20 flex-shrink-0 overflow-hidden rounded bg-neutral-800">
                    {source.thumbnail ? (
                      <img
                        src={source.thumbnail}
                        alt={source.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-neutral-600">
                        No preview
                      </div>
                    )}
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm text-white">
                      {source.name}
                    </div>
                    {source.duration && (
                      <div className="text-xs text-neutral-500">
                        {formatDuration(source.duration)}
                      </div>
                    )}
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => removeSource(source.id)}
                    className="flex-shrink-0 rounded p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-white"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Next button */}
      {hasClips && (
        <div className="sticky bottom-0 flex justify-center border-t border-white/5 bg-[#0a0a0a] p-4">
          <button
            onClick={onNext}
            className="flex items-center gap-2 rounded-lg bg-white px-8 py-3 font-medium text-black transition-colors hover:bg-neutral-200"
          >
            Next
            <ArrowRight size={20} weight="bold" />
          </button>
        </div>
      )}
    </main>
  );
}
