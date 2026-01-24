# Pipeline Bug Investigation - Handoff Document

## Problem
The processing pipeline fails at some point during execution. The pipeline has extensive `console.log` tracing added. Run the app, trigger the pipeline, check browser devtools console, and find where it stops/errors.

## Architecture

**Tauri desktop app** (Rust backend + TypeScript/React frontend) for AI-assisted video assembly cuts.

### Pipeline Flow (`src/api/processingPipeline.ts` → `runPipeline()`)

```
Pre-phase: Compute CIDs (content-addressable hashes for caching)
     ↓ Tauri invoke("generate_cid") per source
Phase 1: Transcribe
     ↓ loadFileFromPath → transcribeFile (ElevenLabs scribe_v2)
     ↓ mapTranscriptToSegments → word-level Segments (text + video layers)
     ↓ If 0 words: creates a fallback video-only segment (0 to source.duration)
Phase 2: Group segments
     ↓ segmentGrouping.ts → one SegmentGroup per source (all words concatenated)
     ↓ Also creates video-only groups for sources with no speech
Phase 2.5: Describe groups with Gemini (optional, requires VITE_GEMINI_API_KEY)
     ↓ Per source: uploadVideoFile → queryVideoOverview (single call, all groups)
     ↓ Returns JSON array of {groupId, description}
     ↓ Maps descriptions onto SegmentGroup.description
Phase 3: Assembly cut with Claude (only if >1 source AND >1 group)
     ↓ requestAssemblyCut → Claude Sonnet → ordered group IDs
```

### Key Files (current state)

| File | Role |
|------|------|
| `src/api/processingPipeline.ts` | Pipeline orchestrator — calls all phases |
| `src/api/transcribe.ts` | ElevenLabs speech-to-text + segment creation |
| `src/api/segmentGrouping.ts` | Groups all text segments from a source into one group |
| `src/api/describeSegments.ts` | Gemini description orchestrator (operates on SegmentGroups) |
| `src/api/gemini.ts` | Gemini API: `uploadVideoFile` + `queryVideoOverview` |
| `src/api/assemblyCut.ts` | Claude API for narrative ordering + `groupSegments` (unused legacy) |
| `src/api/cache.ts` | CID-based caching via Tauri backend (SQLite) |
| `src/types/index.ts` | All TypeScript interfaces |
| `src-tauri/src/lib.rs` | Tauri app setup, registered commands |

### Environment Variables
- `VITE_ELEVENLABS_API_KEY` — ElevenLabs transcription
- `VITE_GEMINI_API_KEY` — Gemini video understanding (optional, Phase 2.5 skipped without it)
- `VITE_ANTHROPIC_API_KEY` — Claude assembly cut (Phase 3)

### Console Log Prefixes
- `[pipeline]` — processingPipeline.ts (phase transitions, counts, final data dump)
- `[transcribe]` — transcribe.ts (cache hits/misses, API calls, word counts)
- `[describeSegments]` — describeSegments.ts (group counts, Gemini results)
- `[gemini]` — gemini.ts (upload steps 1-3, polling, queryVideoOverview)
- `[assemblyCut]` — assemblyCut.ts (group counts, Claude response preview)

## Current Data Flow Details

### Segment creation (transcribe.ts:64-85)
Each ElevenLabs word becomes a `Segment` with both `text` and `video` layers sharing the same sourceId/start/end timestamps.

### Grouping (segmentGrouping.ts)
`groupSegments()` puts ALL text segments from one source into a SINGLE group. Returns one `SegmentGroup` per source with concatenated text, min start, max end.

Note: `assemblyCut.ts` also exports a `groupSegments` function (lines 44-101) that splits on sentence boundaries and max 8 words — but `processingPipeline.ts` imports from `./segmentGrouping`, NOT from `./assemblyCut`. The one in assemblyCut.ts is dead code.

### Gemini description (gemini.ts:117-187)
`queryVideoOverview` sends ALL groups in a single prompt, asking Gemini to describe each time range. Expects response as JSON array: `[{"groupId": "...", "description": "..."}]`. Parses with regex to handle markdown code blocks.

### Cache type mismatch (potential issue)
- `cache.ts` types `getCachedDescriptions` as returning `Record<string, VisualDescription>` (has `summary`, `person?`, `activity?`, `setting?`)
- But `describeSegments.ts` caches as `Record<string, { summary: string }>` (line 108)
- On cache read (line 55), it accesses `cached[group.groupId].summary` — this works because it wrote `{ summary: desc }` on cache store
- The `VisualDescription` type in cache.ts is broader than what's actually stored — not a bug but could confuse

### Phase 3 condition
Assembly cut only runs when `allGroups.length > 1 && sources.length > 1`. A single source project ALWAYS skips Claude and uses chronological order.

## Likely Failure Points

### 1. segmentGrouping creates only 1 group per source
With the current `segmentGrouping.ts`, each source becomes exactly ONE group containing ALL its words. This means:
- Single source → 1 group → Phase 3 skipped (uses chronological = just that one group)
- Two sources → 2 groups → Phase 3 runs, but Claude gets just 2 giant groups to order

This might not be the "failure" but it means descriptions and assembly cut are operating on very coarse chunks.

### 2. queryVideoOverview JSON parsing
Line 178 uses regex `text.match(/\[[\s\S]*\]/)` to extract JSON. If Gemini wraps response in markdown code fences or adds explanatory text outside the array, this could either:
- Match too greedily (captures non-JSON brackets)
- Fail to match if Gemini uses a different format

### 3. loadFileFromPath memory pressure
The file is read via base64 from Tauri, decoded to bytes, then converted to a File object. For large videos this means:
- Base64 string in memory (~33% overhead)
- Decoded bytes array
- File object
- Then in gemini.ts: `file.arrayBuffer()` creates another copy

For a 500MB video, this could use ~2GB RAM in the webview.

### 4. Gemini upload timeout
`POLL_TIMEOUT_MS = 60000` (60s). Large videos may take longer than 60s to process on Gemini's side.

### 5. Dead code confusion
`assemblyCut.ts` exports `groupSegments` (lines 44-101) which splits into 8-word sentence-bounded groups. But the pipeline uses `segmentGrouping.ts`'s version which creates 1 group per source. If the intent was to use the finer-grained grouping, the wrong function is being imported.

## How to Debug

1. Open browser devtools → Console tab
2. Import source video(s) and trigger the pipeline
3. Watch the `[pipeline]` logs for phase transitions
4. The last log before silence/error tells you exactly where it fails
5. At pipeline end, it dumps full JSON of segments, groups, and ordered IDs — check these for correctness

## Files to Reference

```
src/api/processingPipeline.ts  — main orchestrator (302 lines)
src/api/transcribe.ts          — ElevenLabs + segment creation (86 lines)
src/api/segmentGrouping.ts     — grouping logic (31 lines)
src/api/describeSegments.ts    — Gemini orchestrator (127 lines)
src/api/gemini.ts              — Gemini upload + queryVideoOverview (194 lines)
src/api/assemblyCut.ts         — Claude assembly cut (229 lines)
src/api/cache.ts               — CID caching layer (62 lines)
src/types/index.ts             — all interfaces (165 lines)
```
