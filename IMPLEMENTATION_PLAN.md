# B-Roll Classification Implementation Plan

## Overview
Add B-roll classification to identify and mark content that isn't primary narrative (no speech, irrelevant to narrative, or too short < 1 second).

## Data Structure

### New Types (src/types/index.ts)
```typescript
export type BrollReason = 'no-speech' | 'irrelevant' | 'too-short';

export interface BrollClassification {
  sentenceId: string;
  isBroll: boolean;
  reason: BrollReason;
  confidence: number;  // 0-1, how confident we are this is B-roll
}
```

### Store Addition (src/stores/useProjectStore.ts)
- Add `brollClassifications: Map<string, BrollClassification>` to state
- Add `setBrollClassifications(classifications: BrollClassification[])` action
- Add `clearBrollClassifications()` action

### API Layer (src/api/brollClassification.ts)
Simple API for adding/querying B-roll status:
```typescript
export function classifyAsBroll(sentenceId: string, reason: BrollReason, confidence?: number): void
export function getBrollStatus(sentenceId: string): BrollClassification | null
export function isBroll(sentenceId: string): boolean
```

---

## Stage 1: Data Structure & API
**Goal**: Add BrollClassification type and store support
**Status**: Complete

### Tasks
- [ ] 1.1 Add `BrollReason` and `BrollClassification` types to `src/types/index.ts`
- [ ] 1.2 Add `brollClassifications` Map to `useProjectStore` state (and initialState)
- [ ] 1.3 Add `setBrollClassifications` and `clearBrollClassifications` actions
- [ ] 1.4 Create `src/api/brollClassification.ts` with helper functions
- [ ] 1.5 Update `ProjectData` interface in `src/api/projects.ts` for persistence
- [ ] 1.6 Update `saveProjectData` and `loadProjectData` to handle classifications

**Checkpoint 1**: Types compile, store has new fields, API file exists

---

## Stage 2: Transcription-Stage Detection
**Goal**: Mark sentences as B-roll at transcription stage when no speech detected
**Status**: Complete

### Tasks
- [ ] 2.1 Update `PipelineResult` interface to include `brollClassifications: BrollClassification[]`
- [ ] 2.2 In `runPipeline`, detect transcriptless sources and create BrollClassifications
- [ ] 2.3 In EditPage, store B-roll classifications after pipeline completes

**Checkpoint 2**: Import a video with no speech → it gets marked as B-roll in store

### Detection Rule
- Sources with no transcribed words -> B-roll (reason: `'no-speech'`, confidence: 1.0)

---

## Stage 3: Assembly Cut Detection
**Goal**: Claude marks sentences as B-roll during assembly cut if irrelevant or too short
**Status**: Complete

### Tasks
- [ ] 3.1 Add `mark_broll` tool definition to TOOLS array in `agenticEdit.ts`
- [ ] 3.2 Update `ASSEMBLY_CUT_SYSTEM_PROMPT` with B-roll instructions
- [ ] 3.3 Implement `executeTool` case for `mark_broll`

**Checkpoint 3**: Run assembly cut → Claude uses mark_broll tool → classifications appear in store

### Tool Definition
1. Add new tool `mark_broll` to TOOLS array in `agenticEdit.ts`:
   ```typescript
   {
     name: "mark_broll",
     description: "Mark sentences as B-roll footage. Use for: 1) Very short clips under 1 second, 2) Content not relevant to the main narrative (environmental shots, transitions, etc.)",
     input_schema: {
       type: "object",
       properties: {
         sentence_ids: {
           type: "array",
           items: { type: "string" },
           description: "Array of sentence IDs to mark as B-roll"
         },
         reason: {
           type: "string",
           enum: ["irrelevant", "too-short"],
           description: "Why this is B-roll: 'too-short' for < 1 second clips, 'irrelevant' for non-narrative content"
         }
       },
       required: ["sentence_ids", "reason"]
     }
   }
   ```

2. Update `ASSEMBLY_CUT_SYSTEM_PROMPT` to add B-roll instructions:
   ```
   5. Mark B-roll - Identify and mark as B-roll using mark_broll:
      - Sentences shorter than 1 second (reason: 'too-short')
      - Content that shows environment, transitions, or isn't relevant to the narrative (reason: 'irrelevant')
      - B-roll stays in timeline but displays differently to the user
   ```

3. Implement `executeTool` case for `mark_broll`:
   ```typescript
   case "mark_broll": {
     const sentenceIds = input.sentence_ids as string[];
     const reason = input.reason as BrollReason;
     for (const id of sentenceIds) {
       classifyAsBroll(id, reason, reason === 'too-short' ? 0.9 : 0.8);
     }
     return {
       success: true,
       result: `Marked ${sentenceIds.length} sentence(s) as B-roll (${reason})`,
     };
   }
   ```

### Detection Rules
- Duration < 1 second -> B-roll (reason: `'too-short'`)
- Content not relevant to narrative -> B-roll (reason: `'irrelevant'`)

---

## Stage 4: UI Changes
**Goal**: Render B-roll sentences with visual distinction showing description instead of text
**Status**: Complete

### Tasks
- [ ] 4.1 Create `useBrollClassification` selector in `useProjectStore.ts`
- [ ] 4.2 Update `TranscriptPanel.tsx` to pass B-roll status to SentenceItem
- [ ] 4.3 Update `SentenceItem.tsx` to render B-roll with distinct styling

**Checkpoint 4**: B-roll sentences display "B-Roll" text with italic/muted styling in UI

### Implementation Details
1. Create selector in `useProjectStore.ts`:
   ```typescript
   export const useBrollClassification = (sentenceId: string) =>
     useProjectStore((state) => state.brollClassifications.get(sentenceId));
   ```

2. In `TranscriptPanel.tsx`:
   - Get `brollClassifications` from store
   - Pass `isBroll` boolean to SentenceItem
   - Pass description (from existing `sentenceDescriptions`) for B-roll display

3. In `SentenceItem.tsx`:
   - Add `isBroll?: boolean` prop
   - When `isBroll` is true:
     - Display `"B-Roll"` or `"B-Roll - {description}"` instead of transcript text
     - Add distinct visual styling:
       - Slightly muted/different background
       - Italic text style
       - Optional badge or icon indicator
     - Keep timestamp and source color bar
     - Sentence remains included (not excluded), just styled differently

### UI Display Logic
```tsx
// In SentenceItem render
{isBroll ? (
  <div className="text-[14px] leading-relaxed font-mono font-light italic text-neutral-400">
    {description ? `B-Roll - ${description}` : "B-Roll"}
  </div>
) : (
  // existing word rendering...
)}
```

---

## File Changes Summary

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `BrollReason`, `BrollClassification` types |
| `src/stores/useProjectStore.ts` | Add `brollClassifications` Map, actions, selector |
| `src/api/brollClassification.ts` | **New file** - helper API for classification |
| `src/api/processingPipeline.ts` | Add no-speech B-roll detection, update PipelineResult |
| `src/api/agenticEdit.ts` | Add `mark_broll` tool, update system prompt |
| `src/api/projects.ts` | Update ProjectData type and save/load for persistence |
| `src/pages/EditPage.tsx` | Store B-roll classifications after pipeline |
| `src/components/edit/TranscriptPanel.tsx` | Pass B-roll status to SentenceItem |
| `src/components/edit/SentenceItem.tsx` | Render B-roll with distinct styling |

---

## Testing Checklist
- [ ] Transcriptless sources are marked as B-roll (`no-speech`) on import
- [ ] Claude marks short (<1s) sentences as B-roll (`too-short`) during assembly cut
- [ ] Claude marks irrelevant content as B-roll (`irrelevant`) during assembly cut
- [ ] B-roll sentences display "B-Roll" or "B-Roll - {description}" in UI
- [ ] B-roll sentences are visually distinct (italic, muted) but not excluded
- [ ] B-roll classifications persist on save/load
- [ ] B-roll sentences can still be manually excluded/restored
- [ ] B-roll sentences still play in video composition
