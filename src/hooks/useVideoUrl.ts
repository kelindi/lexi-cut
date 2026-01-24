import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Hook to convert a local file path to a blob URL.
 * Uses Tauri's read_file_base64 command to load the file
 * and creates a blob URL for use in video elements.
 *
 * This is a fallback for when asset:// protocol doesn't work
 * (e.g., in WebKit-based webviews).
 */
export function useVideoUrl(filePath: string): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        console.log("Loading video as blob:", filePath);
        const base64 = await invoke<string>("read_file_base64", { path: filePath });

        if (cancelled) return;

        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const ext = filePath.split(".").pop()?.toLowerCase();
        const mime = ext === "mov" ? "video/quicktime" : "video/mp4";
        const blob = new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);

        urlRef.current = url;
        setBlobUrl(url);
        console.log("Video blob URL created:", url);
      } catch (error) {
        console.error("Failed to load video as blob:", filePath, error);
      }
    })();

    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [filePath]);

  return blobUrl;
}

/**
 * Hook to preload multiple video files as blob URLs.
 * Returns a map of file paths to blob URLs.
 */
export function useVideoUrls(filePaths: string[]): {
  urls: Record<string, string>;
  isLoading: boolean;
} {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const urlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    // Get unique paths
    const uniquePaths = [...new Set(filePaths)];

    console.log("[useVideoUrls] Starting with paths:", uniquePaths);

    if (uniquePaths.length === 0) {
      console.log("[useVideoUrls] No paths, setting isLoading=false");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    (async () => {
      const newUrls: Record<string, string> = {};

      for (const filePath of uniquePaths) {
        if (cancelled) return;

        // Reuse existing blob URL if available
        if (urlsRef.current[filePath]) {
          newUrls[filePath] = urlsRef.current[filePath];
          continue;
        }

        try {
          console.log("[useVideoUrls] Loading video:", filePath);
          const base64 = await invoke<string>("read_file_base64", { path: filePath });

          if (cancelled) return;

          console.log("[useVideoUrls] Got base64 data, length:", base64.length);

          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          console.log("[useVideoUrls] Decoded bytes:", bytes.length, "first 4 bytes:", bytes.slice(0, 4));

          const ext = filePath.split(".").pop()?.toLowerCase();
          // WebKit is picky about MIME types - try video/mp4 for everything
          const mime = ext === "mov" ? "video/quicktime" : "video/mp4";
          console.log("[useVideoUrls] Using MIME type:", mime, "for extension:", ext);

          const blob = new Blob([bytes], { type: mime });
          console.log("[useVideoUrls] Blob created, size:", blob.size);

          const url = URL.createObjectURL(blob);

          newUrls[filePath] = url;
          console.log("[useVideoUrls] Blob URL created:", url);
        } catch (error) {
          console.error("[useVideoUrls] Failed to load video:", filePath, error);
        }
      }

      if (!cancelled) {
        // Revoke old URLs that are no longer needed
        for (const [path, url] of Object.entries(urlsRef.current)) {
          if (!newUrls[path]) {
            URL.revokeObjectURL(url);
          }
        }

        urlsRef.current = newUrls;
        setUrls(newUrls);
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filePaths.join(",")]); // Re-run when paths change

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const url of Object.values(urlsRef.current)) {
        URL.revokeObjectURL(url);
      }
      urlsRef.current = {};
    };
  }, []);

  return { urls, isLoading };
}
