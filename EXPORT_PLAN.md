# Export UI & Social Media Integration Plan

## Overview
Create a comprehensive export dialog with:
1. Local export with quality/format options and real-time progress
2. Social media export via Late API (TikTok, YouTube, Instagram, etc.)
3. Platform-specific presets (aspect ratio, codec, bitrate)

## Current State
- Basic export via `useExport.ts` hook → `export.rs` backend
- FFmpeg concat with `-c copy` (no re-encoding)
- Simple "Export" button in TopBar, no modal/options
- No progress feedback during render
- Late API test component exists in TestPage

---

## Stage 1: Export Dialog UI Shell
**Goal**: Create modal dialog with tabs for Local/Social export
**Status**: Complete ✅

### Tasks
- [x] 1.1 Create `ExportDialog.tsx` component with modal structure
- [x] 1.2 Add tab navigation: "Local" | "Social Media"
- [x] 1.3 Wire up dialog open/close from TopBar export button
- [x] 1.4 Add basic styling matching existing design system

**Checkpoint 1**: Export button opens modal with two tabs, can close ✅

### Component Structure
```
src/components/export/
├── ExportDialog.tsx       # Main modal wrapper
├── LocalExportTab.tsx     # Local file export options
├── SocialExportTab.tsx    # Social media platform selection
├── ExportProgress.tsx     # Progress UI (shared)
└── PlatformCard.tsx       # Individual platform option card
```

---

## Stage 2: Local Export Tab
**Goal**: Add quality/format options for local file export
**Status**: Complete ✅

### Tasks
- [x] 2.1 Create `LocalExportTab.tsx` with format/quality options
- [x] 2.2 Add preset selector: "Fast (Copy)", "Standard (H.264)", "High Quality"
- [x] 2.3 Add resolution dropdown: "Original", "1080p", "720p", "4K"
- [ ] 2.4 Show estimated file size (rough calculation) - *skipped for now*
- [x] 2.5 Add "Export" button that triggers export flow

**Checkpoint 2**: Can select quality preset and resolution, triggers export ✅

### Export Presets
| Preset | Codec | Bitrate | Use Case |
|--------|-------|---------|----------|
| Fast (Copy) | -c copy | N/A | Quick preview, same quality as source |
| Standard | H.264 | 8 Mbps | General use, good balance |
| High Quality | H.264 | 20 Mbps | Final delivery, larger files |
| TikTok | H.264 | 6 Mbps | Optimized for TikTok upload |
| YouTube | H.264 | 12 Mbps | Optimized for YouTube |

---

## Stage 3: Backend Progress Events
**Goal**: Send real-time progress from Rust backend to frontend
**Status**: Complete ✅

### Tasks
- [x] 3.1 Add Tauri event emitter for export progress in `export.rs`
- [x] 3.2 Parse FFmpeg stderr for progress (frame count, time, speed)
- [x] 3.3 Emit progress events: `export-progress { current, total, phase, fps }`
- [x] 3.4 Listen for events in `useExportProgress.ts` hook
- [ ] 3.5 Add cancellation support via abort signal - *deferred*

**Checkpoint 3**: Progress bar updates during export ✅

### Progress Event Shape
```typescript
interface ExportProgressEvent {
  phase: 'preparing' | 'rendering' | 'finalizing' | 'complete' | 'error';
  currentSegment: number;
  totalSegments: number;
  currentTime?: number;    // seconds rendered
  totalTime?: number;      // total duration
  fps?: number;            // current render speed
  estimatedRemaining?: number; // seconds
}
```

### FFmpeg Progress Parsing
FFmpeg outputs progress to stderr:
```
frame=  120 fps=60 q=28.0 size=    1024kB time=00:00:04.00 bitrate=2097.2kbits/s speed=2.0x
```
Parse with regex to extract frame, fps, time, speed.

---

## Stage 4: Export Progress UI
**Goal**: Beautiful progress display with phases and time estimate
**Status**: Complete ✅

### Tasks
- [x] 4.1 Create `ExportProgress.tsx` component
- [x] 4.2 Show progress bar with percentage
- [x] 4.3 Display current phase with icon animation
- [x] 4.4 Show time progress (current/total)
- [x] 4.5 Add cancel button (UI only)
- [x] 4.6 Show success state with "Open File" / "Open Folder" buttons

**Checkpoint 4**: Full progress UI during export with all states ✅

### Progress Phases
1. **Preparing** - Building segment list, creating temp files
2. **Rendering** - FFmpeg processing (main progress bar here)
3. **Finalizing** - Cleaning up, moving final file
4. **Complete** - Success with action buttons
5. **Error** - Show error message with retry option

---

## Stage 5: Social Media Tab - Account Connection
**Goal**: Connect social accounts via Late API
**Status**: Complete ✅

### Tasks
- [x] 5.1 Create `SocialExportTab.tsx` component
- [x] 5.2 Create `src/api/late.ts` with API wrapper functions
- [x] 5.3 Create `src/stores/useSocialStore.ts` for connected accounts state
- [x] 5.4 Display platform cards: TikTok, YouTube, Instagram, Twitter, LinkedIn, Facebook
- [x] 5.5 Show connected/disconnected state per platform
- [x] 5.6 Implement OAuth flow for connecting accounts
- [x] 5.7 Persist selected profile ID locally (zustand persist)

**Checkpoint 5**: Can connect accounts via OAuth, shows connected state ✅

### Late API Wrapper (`src/api/late.ts`)
```typescript
export async function getProfiles(): Promise<Profile[]>
export async function getAccounts(): Promise<Account[]>
export async function connectPlatform(platform: string, profileId: string): Promise<string> // returns authUrl
export async function createPost(options: PostOptions): Promise<PostResult>
export async function uploadMedia(file: File): Promise<MediaUpload>
```

### Social Store (`src/stores/useSocialStore.ts`)
```typescript
interface SocialState {
  profiles: Profile[];
  accounts: Account[];
  selectedProfileId: string | null;
  isLoading: boolean;
  error: string | null;
}
```

---

## Stage 6: Social Media Publishing
**Goal**: Export and publish to selected platforms
**Status**: Complete ✅

### Tasks
- [x] 6.1 Add platform selection checkboxes in SocialExportTab
- [x] 6.2 Add caption/description input field
- [ ] 6.3 Add hashtag suggestions based on content - *deferred*
- [x] 6.4 Create publishing flow: Export → Upload → Post (`usePublish` hook)
- [x] 6.5 Show upload/publish progress with phases
- [ ] 6.6 Handle platform-specific requirements (aspect ratio warnings, duration limits) - *deferred to Stage 7*

**Checkpoint 6**: Can export and publish to connected platforms with caption ✅

### Platform Requirements
| Platform | Max Duration | Aspect Ratio | Max Size | Notes |
|----------|--------------|--------------|----------|-------|
| TikTok | 10 min | 9:16 preferred | 4GB | Vertical preferred |
| YouTube | 12 hours | 16:9 preferred | 256GB | Horizontal preferred |
| Instagram Reels | 90 sec | 9:16 | 4GB | Vertical required |
| Twitter/X | 2:20 | Any | 512MB | - |
| LinkedIn | 10 min | Any | 5GB | - |

### Publishing Flow
```
1. User selects platforms + enters caption
2. Click "Publish"
3. Export video locally (with platform-optimal settings)
4. Upload to Late media endpoint
5. Create post via Late API
6. Show success/failure per platform
```

---

## Stage 7: Platform-Specific Presets
**Goal**: Auto-apply optimal export settings per platform
**Status**: Not Started

### Tasks
- [ ] 7.1 Define platform presets (resolution, bitrate, aspect ratio)
- [ ] 7.2 Add aspect ratio handling in FFmpeg command
- [ ] 7.3 Show preview of how video will appear (letterbox/pillarbox/crop)
- [ ] 7.4 Add option to crop/pad for vertical platforms

**Checkpoint 7**: Selecting TikTok auto-suggests 9:16, shows preview

### Aspect Ratio Handling
```rust
// In export.rs - add scale/pad filter for aspect ratio
// For 9:16 (vertical):
// -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2"
```

---

## File Changes Summary

| File | Changes |
|------|---------|
| `src/components/export/ExportDialog.tsx` | **New** - Main export modal |
| `src/components/export/LocalExportTab.tsx` | **New** - Local export options |
| `src/components/export/SocialExportTab.tsx` | **New** - Social media tab |
| `src/components/export/ExportProgress.tsx` | **New** - Progress UI |
| `src/components/export/PlatformCard.tsx` | **New** - Platform option card |
| `src/api/late.ts` | **New** - Late API wrapper |
| `src/stores/useSocialStore.ts` | **New** - Social accounts state |
| `src/hooks/useExport.ts` | Update - Add progress events, presets |
| `src-tauri/src/commands/export.rs` | Update - Add progress events, codec options |
| `src/components/system/TopBar.tsx` | Update - Open export dialog |

---

## Testing Checklist
- [ ] Export dialog opens from TopBar button
- [ ] Can switch between Local and Social tabs
- [ ] Local export with "Fast" preset works (current behavior)
- [ ] Local export with "Standard" preset re-encodes video
- [ ] Progress bar shows accurate progress during render
- [ ] Can cancel export mid-progress
- [ ] Export complete shows success with open file option
- [ ] Can connect TikTok account via OAuth
- [ ] Connected accounts persist across app restarts
- [ ] Can publish to TikTok with caption
- [ ] Platform-specific presets apply correct settings
- [ ] Error states display clearly with retry option
