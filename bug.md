# Pipeline Bug Investigation - Handoff Document

## Problem
The processing pipeline fails at some point during execution. Extensive logging has been added to trace where the failure occurs. The next step is to run the pipeline, read the console logs, and identify the exact failure point.

## Architecture Overview

**Tauri desktop app** (Rust backend + TypeScript/React frontend) for video editing with AI-assisted assembly cuts.

### Pipeline Flow (`src/api/processingPipeline.ts` → `runPipeline()`)

```
Pre-phase: Compute CIDs (content hashes for caching)
     ↓ Tauri invoke("generate_cid") for each source
Phase 1: Transcribe each source
     ↓ loadFileFromPath → transcribeFile (ElevenLabs API)
     ↓ mapTranscriptToSegments → word-level segments
Phase 2: Group segments
     ↓ groupSegments() → SegmentGroups (max 8 words, sentence boundaries)
Phase 2.5: Describe segments with Gemini (optional, if VITE_GEMINI_API_KEY set)
     ↓ uploadVideoFile → queryVideoTimeRange (one per segment)
     ↓ Maps descriptions back to segments and groups
Phase 3: Assembly cut with Claude (if >1 source and >1 group)
     ↓ requestAssemblyCut → Claude Sonnet → ordered group IDs
```

### Key Files

| File | Purpose |
|------|---------|
| `src/api/processingPipeline.ts` | Main pipeline orchestrator |
| `src/api/transcribe.ts` | ElevenLabs speech-to-text |
| `src/api/describeSegments.ts` | Gemini video description orchestrator |
| `src/api/gemini.ts` | Gemini API: upload + queryVideoTimeRange |
| `src/api/assemblyCut.ts` | Claude API for narrative ordering |
| `src/api/cache.ts` | CID-based caching via Tauri backend |
| `src/api/segmentGrouping.ts` | Segment → SegmentGroup logic (also in assemblyCut.ts) |
| `src/types/index.ts` | All TypeScript interfaces |
| `src-tauri/src/lib.rs` | Tauri app setup, registered commands |

### Environment Variables Required
- `VITE_ELEVENLABS_API_KEY` — ElevenLabs transcription
- `VITE_GEMINI_API_KEY` — Gemini video understanding (optional)
- `VITE_ANTHROPIC_API_KEY` — Claude assembly cut

### Logging Prefixes (all go to browser console)
- `[pipeline]` — processingPipeline.ts (phase transitions, counts)
- `[transcribe]` — transcribe.ts (cache hits/misses, API calls, word counts)
- `[describeSegments]` — describeSegments.ts (segment counts, per-segment results)
- `[gemini]` — gemini.ts (upload steps, polling, query responses)
- `[assemblyCut]` — assemblyCut.ts (group counts, Claude response)

## Recent Changes

1. **Removed `queryVideoBatch`** from gemini.ts — was doing batched JSON-structured queries to Gemini that required parsing structured JSON responses.
2. **Switched to `queryVideoTimeRange`** — simpler, one query per segment, returns plain text description. This was already implemented but unused.
3. **Rewrote `describeSegments.ts`** — now iterates segments individually instead of chunking into batches of 5. Uses `queryWithRetry` wrapper with exponential backoff on rate limits.

## Potential Failure Points to Investigate

1. **Phase 1 - `loadFileFromPath`**: Reads file bytes via Tauri `read_file_base64` command, decodes base64 to `File` object. Could fail on large files (memory), or if path is invalid.

2. **Phase 2.5 - Segments have no `video` layer**: `describeSegments` filters on `s.video`. Currently, `mapTranscriptToSegments` in transcribe.ts only creates segments with `text` layer — **no `video` layer is ever set**. This means `describableSegments` will always be empty and descriptions are never generated. This is likely a major issue.

3. **Phase 2.5 - Gemini upload**: Large video files being read into memory twice (once for transcription, once for description). Could cause OOM.

4. **Phase 2.5 - Rate limiting**: `queryVideoTimeRange` is called once per segment with 1s delay. Many segments = many API calls. Could hit Gemini rate limits.

5. **Phase 3 - Assembly cut condition**: Only runs if `allGroups.length > 1 && sources.length > 1`. Single-source projects skip Claude entirely.

## Critical Bug Hypothesis

**The `video` layer is never populated on segments.** Look at `mapTranscriptToSegments` in `transcribe.ts`:

```typescript
return response.words
  .filter((w) => w.type === "word")
  .map((word, index) => ({
    id: `seg-${sourceId}-${index}`,
    text: { word: word.text, confidence: ..., sourceId, start: word.start, end: word.end },
    // ← NO video layer set here
  }));
```

Then in `describeSegments.ts`:
```typescript
const describableSegments = segments.filter((s) => s.video);  // ← always empty!
```

So Phase 2.5 will always log "0/N segments have video layers" and return immediately with no descriptions. The fix would be to either:
- Add a `video` layer to segments during transcription (using the same start/end times), or
- Change `describeSegments` to use the `text` layer's start/end times for Gemini queries instead of requiring a `video` layer.

## How to Debug

1. Run the app with browser devtools open
2. Import source video(s) and trigger the pipeline
3. Look at console logs — the last `[prefix]` log before failure/silence tells you exactly where it broke
4. If Phase 2.5 logs "0/N segments have video layers" — that confirms the hypothesis above
