# Project Management Feature - Handoff

## What Was Done

Added a Projects tab with persistent project creation and listing.

### Files Changed

**Frontend:**
- `src/types/index.ts` — Added `ProjectMeta` interface (`id`, `name`, `createdAt`); `Project` now extends it
- `src/stores/useProjectStore.ts` — Added `projectId`, `projectName` state + `createProject(name)` and `openProject(id, name)` actions
- `src/pages/ProjectsPage.tsx` (new) — Projects tab: create new projects, list/open existing ones
- `src/api/projects.ts` (new) — `loadProjects()` / `saveProjects()` wrappers calling Tauri backend
- `src/App.tsx` — Starts on `"projects"` tab, removed old NewProjectPage gate
- `src/components/system/BottomNav.tsx` — Added "Projects" tab with `FolderSimple` icon

**Backend (Rust):**
- `src-tauri/src/commands/projects.rs` (new) — `load_projects` / `save_projects` commands; reads/writes `projects.json` in app data dir
- `src-tauri/src/commands/mod.rs` — Registered projects module
- `src-tauri/src/lib.rs` — Added commands to invoke handler

**Removed:**
- `src/pages/NewProjectPage.tsx` — Superseded by `ProjectsPage`

### Architecture

```
User creates/opens project
        │
        ▼
  ProjectsPage.tsx
        │
        ├─ saveProjects() ──► Tauri invoke ──► projects.rs ──► app_data_dir/projects.json
        │
        └─ createProject() / openProject() ──► useProjectStore (Zustand, in-memory session)
```

- **Persistence:** `projects.json` in Tauri `app_data_dir` stores the list of `ProjectMeta`
- **Session state:** Zustand holds which project is currently active (`projectId`/`projectName`)

### What's Next

- [ ] Persist project *data* (sources, segments, timeline) per project — currently only metadata is saved
- [ ] Delete project functionality
- [ ] Rename project
- [ ] Show project name in the header/nav when a project is open
- [ ] Navigate to clips tab automatically after creating/opening a project
