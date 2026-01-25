#!/usr/bin/env node
/**
 * Remotion video render script
 * Called by Tauri to render the video with proper transitions
 *
 * Usage: node render-video.mjs <input-json> <output-path>
 * Input JSON contains: { segments, videoUrls, width, height }
 */

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: node render-video.mjs <input-json-path> <output-path>");
    process.exit(1);
  }

  const inputJsonPath = args[0];
  const outputPath = args[1];

  // Read input data
  let inputData;
  try {
    const jsonContent = fs.readFileSync(inputJsonPath, "utf-8");
    inputData = JSON.parse(jsonContent);
  } catch (e) {
    console.error("Failed to read input JSON:", e.message);
    process.exit(1);
  }

  const { segments, videoUrls, width = 1920, height = 1080 } = inputData;

  console.log(`Rendering ${segments.length} segments to ${outputPath}`);
  console.log(`Resolution: ${width}x${height}`);

  try {
    // Bundle the Remotion project
    console.log("Bundling Remotion project...");
    const bundleLocation = await bundle({
      entryPoint: path.join(__dirname, "../src/remotion/index.tsx"),
      // Use the project's webpack config if available
      webpackOverride: (config) => config,
    });

    console.log("Bundle created at:", bundleLocation);

    // Select the composition
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "VideoExport",
      inputProps: {
        segments,
        videoUrls,
      },
    });

    console.log(`Composition duration: ${composition.durationInFrames} frames`);

    // Render the video
    console.log("Starting render...");
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: {
        segments,
        videoUrls,
      },
      onProgress: ({ progress }) => {
        // Output progress as JSON for Tauri to parse
        console.log(JSON.stringify({ type: "progress", percent: Math.round(progress * 100) }));
      },
    });

    console.log(JSON.stringify({ type: "complete", outputPath }));
  } catch (e) {
    console.error(JSON.stringify({ type: "error", message: e.message }));
    process.exit(1);
  }
}

main();
