# Project Save Architecture

## Overview

Lexi Cut stores project data in `~/Documents/Lexi Cut/`. This document explains the data structures, file organization, and save/load flow.

## Directory Structure

```
~/Documents/Lexi Cut/
├── projects.json              # Index of all projects (metadata only)
└── projects/
    └── {project-id}/
        ├── project.json       # Full project state
        ├── sources/           # Copied/linked media files (optional)
        └── exports/           # Rendered output files
```

## Data Structures

### 1. Project Metadata (`projects.json`)

A lightweight index for the projects list screen. Stored at the root level.

```typescript
interface ProjectMeta {
  id: string;           // UUID
  name: string;         // User-defined project name
  createdAt: number;    // Unix timestamp (ms)
  updatedAt?: number;   // Last save timestamp (ms)
  thumbnail?: string;   // Base64 or path to preview image
}
```

**Example `projects.json`:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Interview Cut",
    "createdAt": 1706123456789,
    "updatedAt": 1706234567890
  }
]
```

### 2. Full Project State (`projects/{id}/project.json`)

Contains all project data needed to restore the editing session.

```typescript
interface ProjectData {
  // Identity
  id: string;
  name: string;
  savedAt: number;           // Unix timestamp (ms)

  // Sources (media files)
  sources: Source[];

  // Transcription data (raw)
  words: Word[];
  sentences: Sentence[];
  segmentGroups: SegmentGroup[];

  // Timeline (first-class edit state)
  timeline: Timeline;

  // Sources without transcripts
  transcriptlessSourceIds: string[];
}
```

### 3. Timeline (First-Class Edit State)

The Timeline structure is the primary representation of the user's edit. It's designed to be:
- **Serializable**: Stores complete edit state for persistence
- **AI-readable**: Denormalized text makes it easy for AI to understand the narrative
- **Extensible**: Supports video overrides for B-roll

```typescript
interface Timeline {
  version: number;           // Schema version (currently 1)
  entries: TimelineEntry[];  // Ordered list of timeline entries
}

interface TimelineEntry {
  sentenceId: string;        // Reference to Sentence
  text: string;              // Denormalized for AI readability
  sourceId: string;          // Original source ID
  excluded: boolean;         // Whether this entry is cut from timeline
  excludedWordIds: string[]; // Individual words cut from this entry
  videoOverride?: VideoOverride;  // Optional B-roll override
}

interface VideoOverride {
  sourceId: string;          // B-roll source to use instead
  start: number;             // Start time in source (seconds)
  end: number;               // End time in source (seconds)
}
```

**Key design decisions:**
- Edit state is per-sentence, not global flat arrays
- Text is denormalized so AI can read the narrative without joins
- `videoOverride` allows replacing audio's video with B-roll while keeping audio

### 4. Source (Media File)

```typescript
interface Source {
  id: string;
  cid?: string;              // Content-addressable ID (hash)
  name: string;              // Filename
  thumbnail: string;         // Base64 data URL
  path: string;              // Original file path
  duration?: number;         // Duration in seconds
  descriptions?: SourceDescription[];
}

interface SourceDescription {
  start: number;
  end: number;
  description: string;       // AI-generated scene description
}
```

### 5. Word (Transcription Unit)

```typescript
interface Word {
  id: string;
  sourceId: string;
  word: string;              // The transcribed text
  start: number;             // Start time in seconds
  end: number;               // End time in seconds
  confidence: number;        // 0-1 transcription confidence
}
```

### 6. Sentence (Grouped Words)

```typescript
interface Sentence {
  sentenceId: string;
  sourceId: string;
  wordIds: string[];         // References to Word IDs
  text: string;              // Combined text of all words
  startTime: number;
  endTime: number;
  originalGroupId?: string;  // For visual grouping
}
```

### 7. SegmentGroup (Legacy)

```typescript
interface SegmentGroup {
  groupId: string;
  sourceId: string;
  segmentIds: string[];
  text: string;
  startTime: number;
  endTime: number;
  avgConfidence: number;
}
```

## Example `project.json`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Interview Cut",
  "savedAt": 1706234567890,
  "sources": [
    {
      "id": "src-1",
      "name": "interview.mp4",
      "thumbnail": "data:image/jpeg;base64,...",
      "path": "/Users/me/Videos/interview.mp4",
      "duration": 120.5
    }
  ],
  "words": [
    { "id": "w1", "sourceId": "src-1", "word": "Hello", "start": 0.0, "end": 0.5, "confidence": 0.98 },
    { "id": "w2", "sourceId": "src-1", "word": "world", "start": 0.5, "end": 1.0, "confidence": 0.95 }
  ],
  "sentences": [
    {
      "sentenceId": "s1",
      "sourceId": "src-1",
      "wordIds": ["w1", "w2"],
      "text": "Hello world",
      "startTime": 0.0,
      "endTime": 1.0
    }
  ],
  "segmentGroups": [],
  "timeline": {
    "version": 1,
    "entries": [
      {
        "sentenceId": "s1",
        "text": "Hello world",
        "sourceId": "src-1",
        "excluded": false,
        "excludedWordIds": []
      }
    ]
  },
  "transcriptlessSourceIds": []
}
```

## Migration from Legacy Format

Projects saved before the Timeline structure used flat arrays:

```typescript
// Legacy format (deprecated)
{
  orderedSentenceIds: string[];
  excludedSentenceIds: string[];
  excludedWordIds: string[];
}
```

On load, if `timeline` is missing or `version < 1`, the `migrateToTimeline()` function converts:

```typescript
function migrateToTimeline(data: ProjectData): Timeline {
  const entries = data.orderedSentenceIds.map(sentenceId => {
    const sentence = data.sentences.find(s => s.sentenceId === sentenceId);
    const isExcluded = data.excludedSentenceIds.includes(sentenceId);
    const wordExclusions = sentence.wordIds.filter(
      wid => data.excludedWordIds.includes(wid)
    );

    return {
      sentenceId,
      text: sentence.text,
      sourceId: sentence.sourceId,
      excluded: isExcluded,
      excludedWordIds: wordExclusions,
    };
  });

  return { version: 1, entries };
}
```

On save, only the `timeline` field is written; deprecated arrays are omitted.

## Save Flow

### When "Save" is clicked:

1. Check `isDirty` flag - skip if no changes
2. Gather current state from stores:
   - `useProjectStore`: words, sentences, timeline
   - `useSourcesStore`: sources with thumbnails, paths
3. Build `ProjectData` object
4. Write to `~/Documents/Lexi Cut/projects/{id}/project.json`
5. Update `updatedAt` in `projects.json`
6. Call `markClean()` to reset dirty flag

### When "Open Project" is clicked:

1. Call `openProject(id, name)` to set active project
2. Load `projects/{id}/project.json`
3. If no `timeline`, call `migrateToTimeline()` to convert legacy format
4. Hydrate stores with loaded data
5. Set `isDirty = false`

## Dirty State Tracking

The `isDirty` flag tracks unsaved changes. Actions that set it:

- `initializeTimeline()` - After processing pipeline
- `reorderEntry()` - Drag to reorder sentences
- `setEntryExcluded()` - Delete/restore sentences
- `toggleWordExcluded()` - Cut/restore individual words
- `setWords()`, `setSentences()` - After transcription
- Source changes in `useSourcesStore`

## Rust Backend Commands

```rust
// Load project list
#[tauri::command]
fn load_projects(app: AppHandle) -> Result<Vec<ProjectMeta>, String>

// Save project list
#[tauri::command]
fn save_projects(app: AppHandle, projects: Vec<ProjectMeta>) -> Result<(), String>

// Save full project data
#[tauri::command]
fn save_project_data(app: AppHandle, data: ProjectData) -> Result<(), String>

// Load full project data (with auto-migration)
#[tauri::command]
fn load_project_data(app: AppHandle, project_id: String) -> Result<Option<ProjectData>, String>
```

## Notes

- **Thumbnails**: Stored as base64 data URLs in the JSON
- **Media Files**: Original paths are stored. Files are NOT copied into the project folder
- **CIDs**: Content-addressable IDs allow detecting if source files have changed
- **Timeline Version**: Currently at version 1. Future migrations can check and upgrade
- **VideoOverride**: Prepared for B-roll feature but not yet exposed in UI
