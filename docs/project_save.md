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
  },
  {
    "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "name": "Tutorial Video",
    "createdAt": 1706012345678
  }
]
```

### 2. Full Project State (`projects/{id}/project.json`)

Contains all project data needed to restore the editing session.

```typescript
interface ProjectData {
  // Identity (matches ProjectMeta)
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;

  // Sources (media files)
  sources: Source[];

  // Transcription data
  words: Word[];
  sentences: Sentence[];

  // Timeline state
  orderedSentenceIds: string[];
  excludedSentenceIds: string[];
  excludedWordIds: string[];

  // Legacy (for backward compatibility)
  segmentGroups: SegmentGroup[];
  orderedGroupIds: string[];
  excludedGroupIds: string[];

  // Processing state (may not need to persist)
  transcriptlessSourceIds: string[];
}
```

### 3. Source (Media File)

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

### 4. Word (Transcription Unit)

```typescript
interface Word {
  id: string;
  sourceId: string;
  text: string;
  start: number;             // Start time in seconds
  end: number;               // End time in seconds
  confidence: number;        // 0-1 transcription confidence
  type: "word" | "spacing" | "audio_event";
  speakerId?: string;
}
```

### 5. Sentence (Grouped Words)

```typescript
interface Sentence {
  sentenceId: string;
  sourceId: string;
  wordIds: string[];
  text: string;              // Combined text of all words
  startTime: number;
  endTime: number;
  avgConfidence: number;
}
```

## Save Flow

### When "Create Project" is clicked:

1. Generate new UUID for project
2. Create `ProjectMeta` with id, name, createdAt
3. Append to `projects.json`
4. Call `openProject(id, name)` to set active project
5. Initialize empty project state in Zustand store

```
User clicks "Create"
    → saveProjects([newMeta, ...existing])  // Updates projects.json
    → openProject(id, name)                  // Sets active project in store
```

### When "Save" is clicked:

1. Check `isDirty` flag - skip if no changes
2. Gather current state from stores:
   - `useProjectStore`: words, sentences, timeline order, exclusions
   - `useSourcesStore`: sources with thumbnails, paths, CIDs
3. Build `ProjectData` object
4. Write to `~/Documents/Lexi Cut/projects/{id}/project.json`
5. Update `updatedAt` in `projects.json`
6. Call `markClean()` to reset dirty flag

```
User clicks "Save"
    → if (!isDirty) return
    → projectData = gatherProjectState()
    → saveProjectData(projectId, projectData)  // Writes project.json
    → updateProjectMeta(projectId, { updatedAt }) // Updates projects.json
    → markClean()
```

### When "Open Project" is clicked:

1. Call `openProject(id, name)` to set active project
2. Load `projects/{id}/project.json`
3. Hydrate stores with loaded data:
   - Sources → `useSourcesStore`
   - Words, sentences, timeline → `useProjectStore`
4. Set `isDirty = false`

```
User clicks project card
    → openProject(id, name)
    → projectData = loadProjectData(id)
    → hydrateStores(projectData)
    → markClean()
```

## Dirty State Tracking

The `isDirty` flag tracks unsaved changes. It's set to `true` when:

- Sources are added/removed
- Words are transcribed
- Sentences are reordered
- Items are excluded/restored
- Any timeline edits occur

Actions that set `isDirty: true`:
- `setWords()`
- `setSentences()`
- `reorderSentences()`
- `excludeSentence()` / `restoreSentence()`
- `toggleWordExclusion()`
- `setSegmentGroups()`
- `reorderGroups()`
- `excludeGroup()` / `restoreGroup()`
- `updateGroupText()`

## Rust Backend Commands

### Current Commands

```rust
// Load project list
#[tauri::command]
fn load_projects(app: AppHandle) -> Result<Vec<ProjectMeta>, String>

// Save project list
#[tauri::command]
fn save_projects(app: AppHandle, projects: Vec<ProjectMeta>) -> Result<(), String>
```

### Commands Needed for Full Save

```rust
// Save full project data
#[tauri::command]
fn save_project_data(
    app: AppHandle,
    project_id: String,
    data: ProjectData
) -> Result<(), String>

// Load full project data
#[tauri::command]
fn load_project_data(
    app: AppHandle,
    project_id: String
) -> Result<ProjectData, String>

// Delete project and its folder
#[tauri::command]
fn delete_project(
    app: AppHandle,
    project_id: String
) -> Result<(), String>
```

## Implementation TODO

1. **Rust Backend:**
   - [ ] Add `save_project_data` command
   - [ ] Add `load_project_data` command
   - [ ] Add `delete_project` command (also removes folder)
   - [ ] Define Rust structs matching TypeScript interfaces

2. **Frontend API:**
   - [ ] Create `src/api/projectData.ts` with save/load functions
   - [ ] Wire up `handleSave` in TopBar to actual save

3. **Store Hydration:**
   - [ ] Add `hydrateProject(data: ProjectData)` action
   - [ ] Call on project open to restore state

4. **Sources Store:**
   - [ ] Track dirty state for sources
   - [ ] Include sources in project save

## Notes

- **Thumbnails**: Stored as base64 data URLs in the JSON. For large projects, consider storing as separate files.
- **Media Files**: Original paths are stored. Files are NOT copied into the project folder by default (saves disk space). Consider adding an "archive project" feature that copies media.
- **CIDs**: Content-addressable IDs allow detecting if source files have changed or been moved.
- **Backward Compatibility**: Legacy `segmentGroups` and `orderedGroupIds` are kept for projects created before the sentence-based timeline.
