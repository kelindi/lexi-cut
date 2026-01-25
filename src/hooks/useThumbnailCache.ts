import { useEffect, useRef, useState } from "react";
import type { Segment } from "../types";

interface ThumbnailCache {
  [key: string]: string; // "sourcePath:timestamp" -> data URL
}

/**
 * Extracts a frame from a video at a specific timestamp using canvas.
 * Returns a data URL of the frame as JPEG.
 */
async function extractFrame(
  videoEl: HTMLVideoElement,
  timestamp: number,
  width: number = 160,
  height: number = 90
): Promise<string> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        ctx.drawImage(videoEl, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      } finally {
        videoEl.removeEventListener("seeked", onSeeked);
      }
    };

    videoEl.addEventListener("seeked", onSeeked);
    videoEl.currentTime = timestamp;

    // Timeout fallback
    setTimeout(() => {
      videoEl.removeEventListener("seeked", onSeeked);
      reject(new Error("Seek timeout"));
    }, 3000);
  });
}

/**
 * Hook that generates and caches thumbnails for timeline segments.
 * Uses HTML5 video + canvas for fast, browser-native extraction.
 */
export function useThumbnailCache(segments: Segment[]) {
  const [cache, setCache] = useState<ThumbnailCache>({});
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Group segments by source path
    const segmentsBySource = new Map<string, Segment[]>();
    for (const seg of segments) {
      const existing = segmentsBySource.get(seg.sourcePath) || [];
      existing.push(seg);
      segmentsBySource.set(seg.sourcePath, existing);
    }

    // Process each source
    for (const [sourcePath, segs] of segmentsBySource) {
      // Get or create video element for this source
      let video = videoRefs.current.get(sourcePath);
      if (!video) {
        video = document.createElement("video");
        video.src = `asset://localhost/${encodeURIComponent(sourcePath)}`;
        video.preload = "metadata";
        video.muted = true;
        video.crossOrigin = "anonymous";
        videoRefs.current.set(sourcePath, video);
      }

      // Queue thumbnail extraction for each segment
      const processSegments = async () => {
        // Wait for video metadata to load
        if (video!.readyState < 1) {
          await new Promise<void>((resolve) => {
            const onLoaded = () => {
              video!.removeEventListener("loadedmetadata", onLoaded);
              resolve();
            };
            video!.addEventListener("loadedmetadata", onLoaded);
          });
        }

        for (const seg of segs) {
          const cacheKey = `${sourcePath}:${seg.sourceStart.toFixed(2)}`;

          // Skip if already cached or pending
          if (cache[cacheKey] || pendingRef.current.has(cacheKey)) {
            continue;
          }

          pendingRef.current.add(cacheKey);

          try {
            const thumbnail = await extractFrame(video!, seg.sourceStart);
            setCache((prev) => ({ ...prev, [cacheKey]: thumbnail }));
          } catch (err) {
            console.warn(`Failed to extract thumbnail for ${cacheKey}:`, err);
          } finally {
            pendingRef.current.delete(cacheKey);
          }
        }
      };

      processSegments();
    }

    // Cleanup old video elements for sources no longer in use
    const currentSources = new Set(segments.map((s) => s.sourcePath));
    for (const [path, video] of videoRefs.current) {
      if (!currentSources.has(path)) {
        video.src = "";
        videoRefs.current.delete(path);
      }
    }
  }, [segments, cache]);

  // Helper to get thumbnail for a segment
  const getThumbnail = (segment: Segment): string | undefined => {
    const cacheKey = `${segment.sourcePath}:${segment.sourceStart.toFixed(2)}`;
    return cache[cacheKey];
  };

  return { cache, getThumbnail };
}
