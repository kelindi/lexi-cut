# AI Services Reference

This document describes the reusable AI service primitives available in `src/api/`.

All services use `@tauri-apps/plugin-http` for network requests (bypasses CORS). API keys are read from environment variables (`.env` file).

---

## Adding New API Endpoints

When adding new service endpoints, use the Tauri HTTP plugin — not browser `fetch`:

```typescript
import { fetch } from "@tauri-apps/plugin-http";

const response = await fetch("https://api.example.com/endpoint", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
```

This is required because the app runs in a Tauri webview where browser `fetch` is blocked by CORS for direct API calls. The Tauri HTTP plugin makes requests at the native/OS level, bypassing CORS entirely.

---

## 1. ElevenLabs Transcription

**File:** `src/api/transcribe.ts`
**Env var:** `VITE_ELEVENLABS_API_KEY`

### `transcribeFile(file: File): Promise<ElevenLabsTranscriptResponse>`

Uploads an audio/video file and returns word-level transcription with timestamps and confidence.

- Model: `scribe_v2`
- Granularity: word-level timestamps
- Returns: language code, full text, and individual words with `start`, `end`, `type`, `logprob`

### `mapTranscriptToSegments(response: ElevenLabsTranscriptResponse, sourceId: string): Segment[]`

Converts an ElevenLabs response into the internal `Segment[]` format. Each word becomes a segment with a `TextLayer` containing:
- `word` — the transcribed word
- `confidence` — derived from `Math.exp(logprob)`
- `sourceId` — which source file it came from
- `start` / `end` — timestamps in seconds

---

## 2. Gemini Video Understanding

**File:** `src/api/gemini.ts`
**Env var:** `VITE_GEMINI_API_KEY`

### `uploadVideoFile(file: File): Promise<{ uri: string; mimeType: string }>`

Uploads a video file to Gemini via resumable upload protocol. Polls until the file reaches `ACTIVE` state (timeout: 60s).

Returns the file URI for use in subsequent queries.

### `queryVideoTimeRange(fileUri: string, mimeType: string, startTime: number, endTime: number, spokenText: string): Promise<string>`

Queries Gemini 2.0 Flash about a specific time range of an uploaded video.

- Sends the video file reference + a text prompt
- Prompt includes the time range and spoken words for context
- Returns a 1-2 sentence description of what's happening visually
- Throws `RateLimitError` on HTTP 429 (enables retry logic upstream)

### `RateLimitError`

Custom error class for rate limit detection. Enables callers to implement backoff/retry.

---

## 3. Claude Assembly Cut

**File:** `src/api/assemblyCut.ts`
**Env var:** `VITE_ANTHROPIC_API_KEY`

### `groupSegments(segments: Segment[], maxWordsPerGroup?: number): SegmentGroup[]`

Groups word-level segments into phrase groups (default max 8 words). Breaks on:
- Sentence-ending punctuation (`.!?`)
- Word count limit
- Source file boundaries

Returns `SegmentGroup[]` with combined text, time range, and average confidence.

### `requestAssemblyCut(request: AssemblyCutRequest): Promise<AssemblyCutResult>`

Sends segment groups to Claude Sonnet 4 for narrative analysis. Claude determines:
- Optimal narrative order
- Duplicate/retake detection
- Best take recommendations (by confidence and completeness)

**Input:**
```typescript
{
  segmentGroups: SegmentGroup[]
  sourceNames: Record<string, string>  // sourceId → filename
}
```

**Output:**
```typescript
{
  orderedSegmentIds: string[]        // recommended playback order
  duplicates: DuplicateGroup[]       // detected retakes with recommendations
  narrativeSummary: string           // summary of the narrative flow
}
```

---

## 4. Segment Description (Gemini Integration)

**File:** `src/api/describeSegments.ts`

### `describeSegments(file: File, segments: Segment[], onProgress?: (p: DescriptionProgress) => void): Promise<Segment[]>`

Adds visual descriptions to segments by uploading video to Gemini and querying each segment group.

- Uses `segmentGrouping.ts` to group by sentence boundaries (min 2s, max 15s)
- Rate-limit aware: exponential backoff with 3 retries
- 500ms delay between queries
- Returns new segment array with `description` field populated
- Gracefully returns original segments if API key is missing or queries fail

---

## 5. Segment Grouping (Duration-Based)

**File:** `src/api/segmentGrouping.ts`

### `groupSegments(segments: Segment[], sourceId: string): SegmentGroup[]`

Groups segments by sentence boundaries and duration constraints:
- Breaks at `.!?` if group duration >= 2s
- Hard break at 15s max duration
- Merges short trailing groups into the previous group
- Calculates average confidence per group

**Note:** This is different from the word-count-based `groupSegments` in `assemblyCut.ts`. This one is used by `describeSegments` for video queries; the other is used for Claude analysis.

---

## 6. Processing Pipeline (Orchestration)

**File:** `src/api/processingPipeline.ts`

### `runPipeline(sources: Source[], onProgress?: ProgressCallback): Promise<PipelineResult>`

End-to-end orchestration:
1. Loads files from Tauri filesystem (via `read_file_base64` command)
2. Transcribes each source with ElevenLabs
3. Groups segments by source using duration-based grouping
4. Calls Claude assembly cut (only if multiple sources with multiple groups)
5. Falls back to chronological order if Claude fails

**Output:**
```typescript
{
  segments: Segment[]
  segmentGroups: SegmentGroup[]
  orderedGroupIds: string[]
}
```

---

## Core Types

Defined in `src/types/index.ts`:

```typescript
interface Segment {
  id: string
  description?: string
  text?: TextLayer
  video?: VideoLayer
  audio?: AudioLayer
}

interface TextLayer {
  word: string
  confidence: number
  sourceId: string
  start: number  // seconds
  end: number    // seconds
}

interface SegmentGroup {
  groupId: string
  sourceId: string
  segmentIds: string[]
  text: string
  startTime: number
  endTime: number
  avgConfidence: number
}

interface Source {
  id: string
  name: string
  path: string
  thumbnail: string
  duration?: number
}

interface DescriptionProgress {
  phase: "uploading" | "processing" | "querying"
  current: number
  total: number
}

interface ProcessingProgress {
  current: number
  total: number
  message?: string
}
```

---

## Encapsulation Notes

- All service functions are **pure and stateless** — no singletons, no shared mutable state
- Each service can be used independently or composed together
- Error handling is explicit: custom error classes (`RateLimitError`), descriptive messages, graceful fallbacks
- Progress reporting is callback-based and optional
- Types are shared via `src/types/index.ts` — the only coupling between services
