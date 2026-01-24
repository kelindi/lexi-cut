# Implementation Plan: Batched Gemini Video Descriptions in Pipeline

## Overview

Add a **batched video description phase** to the processing pipeline using Gemini 2.0 Flash. Instead of querying Gemini once per segment group (N sequential API calls), batch 5 groups per call (N/5 calls). Enhanced prompts capture **person identity**, **activity**, and **setting** information. Descriptions are mapped back to `Segment` and `SegmentGroup` data structures for use by the agentic editing loop.

---

## Architecture Context

### Current Pipeline Flow (`src/api/processingPipeline.ts`)

```
Phase 1: Transcribe each source → Segment[] (via ElevenLabs Scribe v2)
Phase 2: Group segments → SegmentGroup[] (2-15s chunks by sentence/time)
Phase 3: Assembly cut → orderedGroupIds (via Claude Sonnet 4)
```

### Current Description System (`src/api/describeSegments.ts`)

- Called **separately** from pipeline (not integrated)
- Uploads video once, then queries Gemini **one group at a time** sequentially
- 500ms delay between queries + exponential backoff on 429
- Returns segments with `.description` field populated

### Key Data Structures (`src/types/index.ts`)

```typescript
interface Segment {
  id: string;
  description?: string;    // ← AI-generated visual description (target field)
  text?: TextLayer;
  video?: VideoLayer;
  audio?: AudioLayer;
}

interface SegmentGroup {
  groupId: string;         // "group-0", "group-1", etc.
  sourceId: string;        // References Source.id
  segmentIds: string[];    // References Segment.id[]
  text: string;            // Combined transcribed text
  startTime: number;       // Seconds into source video
  endTime: number;         // Seconds into source video
  avgConfidence: number;   // Average transcription confidence
}
```

### Gemini API Client (`src/api/gemini.ts`)

- Model: `gemini-2.0-flash`
- Upload: Resumable protocol via `https://generativelanguage.googleapis.com/upload/v1beta/files`
- Generate: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
- Uses `@tauri-apps/plugin-http` for CORS bypass (Tauri webview requirement)
- API key: `import.meta.env.VITE_GEMINI_API_KEY`

---

## Stage 1: Add New Types

**File:** `src/types/index.ts`
**Status:** Not Started

### Add `VisualDescription` interface

After the existing `GeminiGenerateContentResponse` interface (around line 120):

```typescript
export interface VisualDescription {
  summary: string;       // 1-2 sentence overall description
  person?: string;       // Person appearance, clothing, expressions, gestures
  activity?: string;     // What is happening (actions, movements, interactions)
  setting?: string;      // Environment, background, location
}
```

### Extend `SegmentGroup` with optional description

Add to the existing `SegmentGroup` interface:

```typescript
export interface SegmentGroup {
  groupId: string;
  sourceId: string;
  segmentIds: string[];
  text: string;
  startTime: number;
  endTime: number;
  avgConfidence: number;
  description?: string;    // ← ADD: Combined visual description from Gemini
}
```

### Extend `ProcessingPhase` union

```typescript
export type ProcessingPhase =
  | "idle"
  | "transcribing"
  | "grouping"
  | "describing"    // ← ADD
  | "assembling"
  | "ready"
  | "error";
```

### Update `DescriptionProgress` phases

```typescript
export interface DescriptionProgress {
  phase: "uploading" | "processing" | "describing";  // ← CHANGE: "querying" → "describing"
  current: number;
  total: number;
}
```

---

## Stage 2: Add Batched Gemini API Function

**File:** `src/api/gemini.ts`
**Status:** Not Started

### Add `queryVideoBatch()` function

Add this after the existing `queryVideoTimeRange()` function (after line 149):

```typescript
export interface BatchGroup {
  groupId: string;
  startTime: number;
  endTime: number;
  text: string;
}

export async function queryVideoBatch(
  fileUri: string,
  mimeType: string,
  groups: BatchGroup[]
): Promise<Record<string, { summary: string; person?: string; activity?: string; setting?: string }>> {
  const apiKey = getApiKey();

  const clipList = groups
    .map(
      (g, i) =>
        `Clip ${i + 1} (ID: "${g.groupId}"): ${g.startTime.toFixed(1)}s to ${g.endTime.toFixed(1)}s. Spoken text: "${g.text}"`
    )
    .join("\n");

  const prompt = `Analyze the following clips from this video. For each clip, provide:
- summary: 1-2 sentence description combining visual and audio context, focusing on what a video editor needs to know
- person: Description of the person on screen (appearance, clothing, facial expressions, gestures, body language)
- activity: What is happening (actions, movements, interactions with objects or environment)
- setting: The environment/background (location, lighting, props visible)

Clips to analyze:
${clipList}

Respond with ONLY valid JSON in this exact format:
{
  "descriptions": {
    "<groupId>": { "summary": "...", "person": "...", "activity": "...", "setting": "..." }
  }
}`;

  const body = {
    contents: [
      {
        parts: [
          { fileData: { mimeType, fileUri } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  const response = await fetch(`${GENERATE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    throw new RateLimitError("Gemini rate limit exceeded");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini batch generateContent failed (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as GeminiGenerateContentResponse;
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned empty batch response");
  }

  const parsed = JSON.parse(text) as {
    descriptions: Record<string, { summary: string; person?: string; activity?: string; setting?: string }>;
  };

  return parsed.descriptions;
}
```

**Notes:**
- Reuses existing `GENERATE_URL` constant and `getApiKey()` helper
- Uses `responseMimeType: "application/json"` to force structured JSON output from Gemini
- Reuses existing `RateLimitError` class for 429 handling
- The `GeminiGenerateContentResponse` type already handles the response shape

---

## Stage 3: Rewrite `describeSegments.ts` with Batching

**File:** `src/api/describeSegments.ts`
**Status:** Not Started

Replace the entire file contents with:

```typescript
import type { Segment, SegmentGroup, DescriptionProgress, VisualDescription } from "../types";
import { groupSegments } from "./segmentGrouping";
import { uploadVideoFile, queryVideoBatch, RateLimitError } from "./gemini";
import type { BatchGroup } from "./gemini";

const BATCH_SIZE = 5;
const DELAY_BETWEEN_BATCHES_MS = 1000;
const MAX_RETRIES = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function queryBatchWithRetry(
  fileUri: string,
  mimeType: string,
  groups: BatchGroup[]
): Promise<Record<string, { summary: string; person?: string; activity?: string; setting?: string }>> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await queryVideoBatch(fileUri, mimeType, groups);
    } catch (err) {
      if (err instanceof RateLimitError && attempt < MAX_RETRIES - 1) {
        const backoff = Math.pow(2, attempt) * 1000;
        await delay(backoff);
        continue;
      }
      console.warn(
        `Gemini batch query failed (attempt ${attempt + 1}/${MAX_RETRIES}):`,
        err instanceof Error ? err.message : err
      );
      if (attempt === MAX_RETRIES - 1) {
        return {};
      }
    }
  }
  return {};
}

export interface DescribeResult {
  segments: Segment[];
  groupDescriptions: Map<string, VisualDescription>;
}

export async function describeSegments(
  file: File,
  segments: Segment[],
  onProgress?: (progress: DescriptionProgress) => void
): Promise<DescribeResult> {
  const emptyResult: DescribeResult = {
    segments,
    groupDescriptions: new Map(),
  };

  // Check if API key is configured
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return emptyResult;
  }

  // Determine sourceId from the first segment with a text layer
  const firstTextSegment = segments.find((s) => s.text);
  if (!firstTextSegment?.text) {
    return emptyResult;
  }
  const sourceId = firstTextSegment.text.sourceId;

  // Phase 1: Upload video
  onProgress?.({ phase: "uploading", current: 0, total: 1 });
  const { uri: fileUri, mimeType } = await uploadVideoFile(file);

  // Phase 2: Group segments
  onProgress?.({ phase: "processing", current: 0, total: 1 });
  const groups = groupSegments(segments, sourceId);

  // Phase 3: Batch query descriptions
  const allDescriptions = new Map<string, VisualDescription>();
  const batches = chunkArray(groups, BATCH_SIZE);

  for (let i = 0; i < batches.length; i++) {
    onProgress?.({ phase: "describing", current: i + 1, total: batches.length });

    const batch = batches[i];
    const batchInput: BatchGroup[] = batch.map((g) => ({
      groupId: g.groupId,
      startTime: g.startTime,
      endTime: g.endTime,
      text: g.text,
    }));

    const result = await queryBatchWithRetry(fileUri, mimeType, batchInput);

    for (const [groupId, desc] of Object.entries(result)) {
      allDescriptions.set(groupId, {
        summary: desc.summary,
        person: desc.person,
        activity: desc.activity,
        setting: desc.setting,
      });
    }

    // Delay between batches to respect rate limits
    if (i < batches.length - 1) {
      await delay(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  // Map descriptions back to segments
  // Build a reverse map: segmentId → groupId
  const segmentToGroup = new Map<string, string>();
  for (const group of groups) {
    for (const segId of group.segmentIds) {
      segmentToGroup.set(segId, group.groupId);
    }
  }

  const enrichedSegments = segments.map((segment) => {
    const groupId = segmentToGroup.get(segment.id);
    if (!groupId) return segment;

    const desc = allDescriptions.get(groupId);
    if (!desc) return segment;

    return { ...segment, description: desc.summary };
  });

  return {
    segments: enrichedSegments,
    groupDescriptions: allDescriptions,
  };
}

/**
 * Build a combined description string for a SegmentGroup from its VisualDescription.
 * Used to populate SegmentGroup.description for the assembly cut prompt.
 */
export function buildGroupDescription(desc: VisualDescription): string {
  return [desc.summary, desc.person, desc.activity, desc.setting]
    .filter(Boolean)
    .join(" | ");
}
```

---

## Stage 4: Integrate into Processing Pipeline

**File:** `src/api/processingPipeline.ts`
**Status:** Not Started

### Add import

At the top of the file, add:

```typescript
import { describeSegments, buildGroupDescription } from "./describeSegments";
```

### Add Phase 2.5 after grouping, before assembly cut

Insert this block after the Phase 2 grouping loop (after the `groupOffset += groups.length;` line, around line 92) and before the Phase 3 assembly cut section:

```typescript
  // Phase 2.5: Describe segments with Gemini (optional)
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (geminiKey) {
    onProgress?.({
      current: 1,
      total: sources.length,
      message: "Analyzing video content...",
    });

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      onProgress?.({
        current: i + 1,
        total: sources.length,
        message: `Describing clips from ${source.name}...`,
      });

      const file = await loadFileFromPath(source.path, source.name);
      const sourceSegments = allSegments.filter(
        (s) => s.text?.sourceId === source.id
      );

      if (sourceSegments.length === 0) continue;

      const result = await describeSegments(file, sourceSegments);

      // Update segments with descriptions
      const descriptionMap = new Map<string, string>();
      for (const seg of result.segments) {
        if (seg.description) {
          descriptionMap.set(seg.id, seg.description);
        }
      }
      for (let j = 0; j < allSegments.length; j++) {
        const desc = descriptionMap.get(allSegments[j].id);
        if (desc) {
          allSegments[j] = { ...allSegments[j], description: desc };
        }
      }

      // Update groups with combined descriptions
      const sourceGroups = allGroups.filter((g) => g.sourceId === source.id);
      for (const group of sourceGroups) {
        const visualDesc = result.groupDescriptions.get(group.groupId);
        if (visualDesc) {
          const idx = allGroups.indexOf(group);
          if (idx !== -1) {
            allGroups[idx] = {
              ...group,
              description: buildGroupDescription(visualDesc),
            };
          }
        }
      }
    }
  }
```

**Important:** The `allSegments` and `allGroups` arrays are mutated via immutable element replacement (matching existing patterns in the file). After this phase, both segments and groups carry description data that the assembly cut can use.

---

## Stage 5: Enhance Assembly Cut with Descriptions

**File:** `src/api/assemblyCut.ts`
**Status:** Not Started

### Update the `buildPrompt()` function

The segment groups passed to `buildPrompt()` now carry a `.description` field. Update the user prompt to include visual context. Replace the `buildPrompt` function body:

```typescript
function buildPrompt(request: AssemblyCutRequest): {
  system: string;
  user: string;
} {
  const sourceCount = Object.keys(request.sourceNames).length;

  const sourceList = Object.entries(request.sourceNames)
    .map(([id, name]) => `- ${id}: ${name}`)
    .join("\n");

  // Format groups with descriptions if available
  const groupsForPrompt = request.segmentGroups.map((g) => ({
    groupId: g.groupId,
    sourceId: g.sourceId,
    text: g.text,
    startTime: g.startTime,
    endTime: g.endTime,
    avgConfidence: g.avgConfidence,
    ...(g.description ? { visualDescription: g.description } : {}),
  }));

  const user = `Here are the transcribed segment groups from ${sourceCount} source file(s):

Source files:
${sourceList}

Segment groups:
${JSON.stringify(groupsForPrompt, null, 2)}

${request.segmentGroups.some((g) => g.description) ? "Each group includes a visual description of what is happening on screen. Use this context to make better narrative ordering decisions — group related scenes together, identify retakes of the same shot, and ensure visual continuity.\n\n" : ""}Please analyze these segments and return the assembly cut as JSON.`;

  return { system: SYSTEM_PROMPT, user };
}
```

### Update SYSTEM_PROMPT to mention visual context

Add this line to the existing `SYSTEM_PROMPT` rules section (after the existing rules):

```
- When visual descriptions are provided, use them to identify same-scene retakes, group visually related content, and ensure smooth visual transitions between segments.
```

---

## Stage 6: Update Processing UI

**File:** Find the component that displays `ProcessingPhase` labels (likely `ProcessingView.tsx` or similar in `src/components/`)
**Status:** Not Started

Add a label mapping for the new `"describing"` phase:

```typescript
// In whatever component maps ProcessingPhase to display text:
case "describing":
  return "Analyzing video content...";
```

If using an object/record pattern:

```typescript
const PHASE_LABELS: Record<ProcessingPhase, string> = {
  idle: "",
  transcribing: "Transcribing...",
  grouping: "Grouping segments...",
  describing: "Analyzing video content...",  // ← ADD
  assembling: "Analyzing narrative flow...",
  ready: "Ready",
  error: "Error",
};
```

---

## Verification Checklist

After implementation, verify:

1. **Pipeline runs end-to-end:** Process a video file. Confirm logs show batched Gemini calls (should be N/5 calls, not N).

2. **Descriptions populated on segments:** After pipeline completes, check `useProjectStore.segments` — each segment should have a `.description` string (the summary).

3. **Descriptions populated on groups:** Check `useProjectStore.segmentGroups` — each group should have a `.description` string (summary | person | activity | setting).

4. **Assembly cut uses descriptions:** Check the console/network tab for the Claude API call. The user prompt should include `visualDescription` fields in the segment groups JSON.

5. **Graceful degradation without API key:** Remove `VITE_GEMINI_API_KEY` from `.env`. Pipeline should skip Phase 2.5 entirely and proceed to assembly cut without descriptions.

6. **Rate limit handling:** If Gemini returns 429, retry with exponential backoff (2^attempt seconds). After 3 failures per batch, skip that batch and continue.

7. **Progress reporting:** The UI should show "Analyzing video content..." during the description phase with a progress indicator showing batch N of M.

---

## File Change Summary

| File | Action | What to do |
|------|--------|------------|
| `src/types/index.ts` | Modify | Add `VisualDescription` interface, add `description?: string` to `SegmentGroup`, add `"describing"` to `ProcessingPhase`, update `DescriptionProgress` |
| `src/api/gemini.ts` | Modify | Add `BatchGroup` interface and `queryVideoBatch()` function |
| `src/api/describeSegments.ts` | Rewrite | Replace sequential queries with batched flow, return `DescribeResult` with `groupDescriptions` map |
| `src/api/processingPipeline.ts` | Modify | Import `describeSegments`/`buildGroupDescription`, add Phase 2.5 between grouping and assembly cut |
| `src/api/assemblyCut.ts` | Modify | Update `buildPrompt()` to include visual descriptions, update `SYSTEM_PROMPT` |
| Processing UI component | Modify | Add `"describing"` phase label |

---

## Notes for Implementing AI

- All HTTP calls MUST use `import { fetch } from "@tauri-apps/plugin-http"` (not native fetch) — this is a Tauri requirement for CORS bypass.
- API key access pattern: `import.meta.env.VITE_GEMINI_API_KEY`
- Follow immutable update patterns: never mutate segments/groups directly. Create new objects with spread: `{ ...segment, description: "..." }`
- The `groupSegments()` function in `src/api/segmentGrouping.ts` is the canonical grouping logic. Don't duplicate it — import and use it.
- Batch size of 5 is a balance between API efficiency and response quality. Gemini handles multi-clip prompts well but quality degrades beyond ~8 clips per call.
- The `responseMimeType: "application/json"` in the Gemini request forces structured JSON output, avoiding markdown wrapping issues.
- Progress callbacks follow the existing pattern: `onProgress?.({ phase, current, total })`
