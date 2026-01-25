import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { tempDir } from "@tauri-apps/api/path";
import { useTimelineSegments } from "./useTimelineSegments";
import { uploadMedia, createPost, type SupportedPlatform } from "../api/late";

/**
 * Load a file from Tauri filesystem to browser File object
 */
async function loadVideoAsFile(path: string): Promise<File> {
  const name = path.split("/").pop() || "export.mp4";
  const base64Data = await invoke<string>("read_file_base64", { path });

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new File([bytes], name, { type: "video/mp4" });
}

export type PublishPhase =
  | "idle"
  | "exporting"
  | "uploading"
  | "publishing"
  | "complete"
  | "error";

export interface PublishProgress {
  phase: PublishPhase;
  percent: number;
  message: string;
}

export interface PublishOptions {
  profileId: string;
  platforms: SupportedPlatform[];
  caption: string;
}

export interface PublishResult {
  success: boolean;
  platforms: Array<{
    platform: string;
    success: boolean;
    error?: string;
  }>;
}

export function usePublish() {
  const [isPublishing, setIsPublishing] = useState(false);
  const [progress, setProgress] = useState<PublishProgress>({
    phase: "idle",
    percent: 0,
    message: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);

  const segments = useTimelineSegments();

  const publish = useCallback(
    async (options: PublishOptions): Promise<PublishResult | null> => {
      if (segments.length === 0) {
        setError("No segments to export");
        return null;
      }

      if (options.platforms.length === 0) {
        setError("No platforms selected");
        return null;
      }

      setIsPublishing(true);
      setError(null);
      setResult(null);
      setProgress({ phase: "exporting", percent: 0, message: "Preparing export..." });

      let unlisten: UnlistenFn | null = null;

      try {
        // Step 1: Export video to temp file
        const tempPath = await tempDir();
        const outputPath = `${tempPath}social_export_${Date.now()}.mp4`;

        // Listen for export progress
        unlisten = await listen<{
          phase: string;
          percent?: number;
          currentSegment: number;
          totalSegments: number;
        }>("export-progress", (event) => {
          const data = event.payload;
          if (data.phase === "rendering" && data.percent) {
            setProgress({
              phase: "exporting",
              percent: Math.min(data.percent * 0.5, 50), // Export is 0-50%
              message: `Rendering segment ${data.currentSegment}/${data.totalSegments}...`,
            });
          } else if (data.phase === "finalizing") {
            setProgress({
              phase: "exporting",
              percent: 45,
              message: "Finalizing video...",
            });
          }
        });

        const exportSegments = segments.map((seg) => ({
          sourcePath: seg.sourcePath,
          startTime: seg.sourceStart,
          endTime: seg.sourceEnd,
        }));

        await invoke("export_video", {
          segments: exportSegments,
          outputPath,
        });

        if (unlisten) {
          unlisten();
          unlisten = null;
        }

        setProgress({
          phase: "uploading",
          percent: 50,
          message: "Uploading video to Late...",
        });

        // Step 2: Read the exported file and upload to Late
        const file = await loadVideoAsFile(outputPath);
        const mediaUpload = await uploadMedia(file);

        setProgress({
          phase: "uploading",
          percent: 75,
          message: "Video uploaded successfully",
        });

        // Step 3: Create post on selected platforms
        setProgress({
          phase: "publishing",
          percent: 80,
          message: `Publishing to ${options.platforms.length} platform${options.platforms.length > 1 ? "s" : ""}...`,
        });

        const postResult = await createPost({
          profileId: options.profileId,
          platforms: options.platforms,
          mediaId: mediaUpload._id,
          caption: options.caption,
        });

        // Build result
        const publishResult: PublishResult = {
          success: postResult.platforms.every((p) => p.status === "success"),
          platforms: postResult.platforms.map((p) => ({
            platform: p.platform,
            success: p.status === "success",
            error: p.error,
          })),
        };

        setResult(publishResult);
        setProgress({
          phase: "complete",
          percent: 100,
          message: publishResult.success
            ? "Published successfully!"
            : "Some platforms failed",
        });

        return publishResult;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError(errorMessage);
        setProgress({
          phase: "error",
          percent: 0,
          message: errorMessage,
        });
        return null;
      } finally {
        if (unlisten) {
          unlisten();
        }
        setIsPublishing(false);
      }
    },
    [segments]
  );

  const reset = useCallback(() => {
    setProgress({ phase: "idle", percent: 0, message: "" });
    setError(null);
    setResult(null);
  }, []);

  return {
    publish,
    isPublishing,
    progress,
    error,
    result,
    reset,
    canPublish: segments.length > 0,
  };
}
