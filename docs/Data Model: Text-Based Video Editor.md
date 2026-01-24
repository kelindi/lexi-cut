# Data Model: Text-Based Video Editor

## Core Concept

This is a **text-based** video editor. The user edits by manipulating a transcript — deleting words, rearranging sentences — and the video/audio output follows.

The **Segment** is the editing primitive. Each segment has optional layers: text, video, and audio. At least one layer must be present.

## Relationship Diagram

```
Project
├── sources: Source[]  (imported media files)
│
└── timeline: Segment[]  (ordered list — the user's edit state)
        │
        ├── text?:  TextLayer   (word + confidence)
        ├── video?: VideoLayer  (sourceId + time range)
        └── audio?: AudioLayer  (sourceId + time range + volume)
```

## Types

### Source

An imported media file.

| Field      | Type   | Description                 |
|------------|--------|-----------------------------|
| `id`       | string | Unique identifier           |
| `filePath` | string | Path to the media file      |
| `duration` | number | Length of source in seconds |

### Segment

The atomic editing unit. Must have at least one layer populated.

| Field   | Type        | Description                  |
|---------|-------------|------------------------------|
| `id`    | string      | Unique identifier            |
| `text`  | TextLayer?  | Word and transcription data  |
| `video` | VideoLayer? | Video time range from source |
| `audio` | AudioLayer? | Audio time range from source |

### TextLayer

| Field        | Type   | Description                    |
|--------------|--------|--------------------------------|
| `word`       | string | The transcribed word           |
| `confidence` | number | Transcription confidence (0-1) |

### VideoLayer

| Field      | Type   | Description                         |
|------------|--------|-------------------------------------|
| `sourceId` | string | References a Source                 |
| `start`    | number | Start time in source file (seconds) |
| `end`      | number | End time in source file (seconds)   |

### AudioLayer

| Field      | Type   | Description                         |
|------------|--------|-------------------------------------|
| `sourceId` | string | References a Source                 |
| `start`    | number | Start time in source file (seconds) |
| `end`      | number | End time in source file (seconds)   |
| `volume`   | number | Volume multiplier (0-1)             |

### Project

Top-level container.

| Field      | Type      | Description            |
|------------|-----------|------------------------|
| `id`       | string    | Unique identifier      |
| `sources`  | Source[]  | All imported media     |
| `timeline` | Segment[] | Ordered active segments|

## Segment Examples

| Use case              | text | video | audio |
|-----------------------|------|-------|-------|
| Transcribed clip      | yes  | yes   | yes   |
| B-roll (no transcript)| —    | yes   | yes   |
| Silent B-roll         | —    | yes   | —     |
| Music track           | —    | —     | yes   |
| Title card            | yes  | —     | —     |

## Future Extensions

The core types are designed to grow via optional fields without breaking existing data.

### Segment-level extensions

| Feature | Field | Where | Description |
|---------|-------|-------|-------------|
| Transitions | `transition?` | Segment | J/L cut or crossfade to the next segment |
| Grouping | `groupId?` | Segment | Group segments into paragraphs for UI |
| Metadata | `metadata?` | Segment | Escape hatch for unforeseen needs |
| Filler words | `fillerWord?` | TextLayer | Flag "um", "uh", "like" for bulk removal |
| Speaker ID | `speakerId?` | TextLayer | Identify who is speaking |
| Transforms | `transform?` | VideoLayer | Crop, scale, position |
| Effects | `effects?` | AudioLayer | EQ, fade in/out, noise reduction |

### Project-level extensions

| Feature | Field | Description |
|---------|-------|-------------|
| B-roll overlays | `overlays?` | Video layer on top of timeline |
| Audio ducking | `audioAdjustments?` | Volume/replacement for a time range |

### Derived (computed, never stored)

| Feature | How | Description |
|---------|-----|-------------|
| Clips | `deriveClips(timeline)` | Contiguous segments from same source |

### Extension pattern

```
Segment-level concern  → optional field on Segment or its layers
Project-wide concern   → optional array on Project
Computed concern       → utility function, no storage
```

Existing projects without these fields load fine — `undefined` means "not used yet."

## Key Design Decisions

1. **Segment is the atom** — each layer (text, video, audio) is optional but at least one must exist.
2. **Layers can reference different sources** — audio and video in the same segment can come from different files.
3. **Timeline is the source of truth** — an ordered array of segments defines the entire edit.
4. **Minimal by design** — clips, transitions, and overlays can be derived or added later without changing these core types.
5. **Undo is straightforward** — snapshot the timeline array or use an operation log.
