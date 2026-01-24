import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { SourceCard, UploadCard } from "../components";
import { useSourcesStore } from "../stores";
import { generateThumbnail } from "../utils/video";
import type { Source } from "../types";

export function AddClipsPage() {
  const [error, setError] = useState("");
  const { sources, addSources, removeSource } = useSourcesStore();

  const handleSelectFiles = async () => {
    setError("");

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
        const thumbnail = await generateThumbnail(path);
        const name = path.split("/").pop() || path;
        return {
          id: crypto.randomUUID(),
          name,
          thumbnail,
          path,
        } as Source;
      }),
    );

    addSources(newSources);
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] p-8">
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <UploadCard onClick={handleSelectFiles} error={error} />

        {sources.map((source) => (
          <SourceCard key={source.id} source={source} onRemove={removeSource} />
        ))}
      </div>
    </main>
  );
}
