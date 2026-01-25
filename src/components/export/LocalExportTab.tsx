import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { ArrowRight } from "@phosphor-icons/react";
import { useTimelineSegments } from "../../hooks/useTimelineSegments";
import { useExportProgress } from "../../hooks/useExportProgress";
import { ExportProgress } from "./ExportProgress";

export type ExportPreset = "fast" | "standard" | "high";
export type ExportResolution = "original" | "4k" | "1080p" | "720p";

interface PresetOption {
  id: ExportPreset;
  name: string;
  description: string;
  codec: string;
  bitrate: string;
}

interface ResolutionOption {
  id: ExportResolution;
  name: string;
  width: number | null;
  height: number | null;
}

const PRESETS: PresetOption[] = [
  {
    id: "fast",
    name: "Fast (Copy)",
    description: "No re-encoding, same quality as source",
    codec: "copy",
    bitrate: "N/A",
  },
  {
    id: "standard",
    name: "Standard",
    description: "H.264, good balance of quality and size",
    codec: "h264",
    bitrate: "8 Mbps",
  },
  {
    id: "high",
    name: "High Quality",
    description: "H.264, larger files, best quality",
    codec: "h264",
    bitrate: "20 Mbps",
  },
];

const RESOLUTIONS: ResolutionOption[] = [
  { id: "original", name: "Original", width: null, height: null },
  { id: "4k", name: "4K (3840×2160)", width: 3840, height: 2160 },
  { id: "1080p", name: "1080p (1920×1080)", width: 1920, height: 1080 },
  { id: "720p", name: "720p (1280×720)", width: 1280, height: 720 },
];

export interface ExportSettings {
  preset: ExportPreset;
  resolution: ExportResolution;
}

interface LocalExportTabProps {
  onClose: () => void;
  onProceedToSocial?: (settings: ExportSettings) => void;
  initialPreset?: ExportPreset;
  initialResolution?: ExportResolution;
}

export function LocalExportTab({
  onClose,
  onProceedToSocial,
  initialPreset = "fast",
  initialResolution = "original",
}: LocalExportTabProps) {
  const [preset, setPreset] = useState<ExportPreset>(initialPreset);
  const [resolution, setResolution] = useState<ExportResolution>(initialResolution);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);

  const segments = useTimelineSegments();
  const { progress, reset } = useExportProgress();

  const selectedPreset = PRESETS.find((p) => p.id === preset)!;
  const canChangeResolution = preset !== "fast";

  const handleExport = async () => {
    if (segments.length === 0) {
      setError("No segments to export");
      return;
    }

    setIsExporting(true);
    setError(null);
    setOutputPath(null);
    reset();

    try {
      const path = await save({
        defaultPath: "export.mp4",
        filters: [{ name: "Video", extensions: ["mp4"] }],
      });

      if (!path) {
        setIsExporting(false);
        return;
      }

      setOutputPath(path);

      const exportSegments = segments.map((seg) => ({
        sourcePath: seg.sourcePath,
        startTime: seg.sourceStart,
        endTime: seg.sourceEnd,
      }));

      await invoke("export_video", {
        segments: exportSegments,
        outputPath: path,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsExporting(false);
    }
  };

  const handleReset = () => {
    reset();
    setError(null);
    setOutputPath(null);
  };

  // Show progress view when exporting or when complete/error
  if (isExporting || progress.phase === "complete" || progress.phase === "error") {
    return (
      <ExportProgress
        progress={progress}
        error={error}
        outputPath={outputPath}
        onClose={onClose}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Preset Selection */}
      <div>
        <label className="mb-2 block text-xs font-medium text-white/60">
          Quality Preset
        </label>
        <div className="flex flex-col gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors ${
                preset === p.id
                  ? "border-white/30 bg-white/10"
                  : "border-white/10 hover:border-white/20 hover:bg-white/5"
              }`}
            >
              <span className="text-sm font-medium text-white">{p.name}</span>
              <span className="text-xs text-white/50">{p.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Resolution Selection */}
      <div>
        <label className="mb-2 block text-xs font-medium text-white/60">
          Resolution
        </label>
        <select
          value={resolution}
          onChange={(e) => setResolution(e.target.value as ExportResolution)}
          disabled={!canChangeResolution}
          className={`w-full rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-white/30 ${
            !canChangeResolution ? "cursor-not-allowed opacity-50" : ""
          }`}
        >
          {RESOLUTIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {!canChangeResolution && (
          <p className="mt-1 text-xs text-white/40">
            Resolution changes require re-encoding (Standard or High preset)
          </p>
        )}
      </div>

      {/* Export Info */}
      <div className="rounded-lg bg-white/5 px-3 py-2">
        <div className="flex justify-between text-xs">
          <span className="text-white/50">Codec</span>
          <span className="text-white">{selectedPreset.codec}</span>
        </div>
        <div className="mt-1 flex justify-between text-xs">
          <span className="text-white/50">Bitrate</span>
          <span className="text-white">{selectedPreset.bitrate}</span>
        </div>
        <div className="mt-1 flex justify-between text-xs">
          <span className="text-white/50">Segments</span>
          <span className="text-white">{segments.length}</span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-2">
        {/* Next: Social Media button */}
        {onProceedToSocial && (
          <button
            onClick={() => onProceedToSocial({ preset, resolution })}
            disabled={segments.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next: Social Media
            <ArrowRight size={16} weight="bold" />
          </button>
        )}

        {/* Export Local Only button */}
        <button
          onClick={handleExport}
          disabled={isExporting || segments.length === 0}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            onProceedToSocial
              ? "border border-white/10 text-white hover:bg-white/5"
              : "bg-white text-black hover:bg-white/90"
          }`}
        >
          {isExporting ? "Exporting..." : onProceedToSocial ? "Export Local Only" : "Export"}
        </button>
      </div>
    </div>
  );
}
