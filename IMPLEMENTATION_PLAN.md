# Implementation Plan: Agentic Assembly Cut with Graceful Fallback

## Goal
Move the assembly cut logic from a one-shot Claude JSON response to use the existing agentic tool-use pattern. This allows graceful fallback when Claude is unavailable - the timeline simply stays in chronological order.

## Current Architecture

### Pipeline Flow (src/api/processingPipeline.ts)
1. **Phase 1**: Transcribe videos → `Word[]`
2. **Phase 2**: Group words → `SegmentGroup[]`
3. **Phase 2.5**: Describe with Gemini (optional) → `SourceDescription[]`
4. **Phase 3**: Assembly cut via Claude → `orderedGroupIds` ← **REMOVE THIS**
5. Build `Sentence[]` from words
6. Return to EditPage

### EditPage Flow (src/pages/EditPage.tsx:48-99)
1. Calls `runPipeline(sources, ...)`
2. Populates store: `setWords`, `setSentences`, etc.
3. `initializeTimeline(result.sentences)` ← Timeline now exists in store
4. `setPhase("ready")`

### Agentic Edit (src/api/agenticEdit.ts)
- Uses Claude tool-use loop with streaming
- Tools defined: `delete_words`, `restore_words`, `delete_sentences`, `restore_sentences`, `reorder_sentences`
- Calls `getAgentContext()` to build timeline state for Claude
- Executes tools via `useAgenticStore` functions

### Agentic Store (src/stores/useAgenticStore.ts)
- Wraps `useProjectStore` mutations with history tracking
- Exports: `deleteWords`, `restoreWords`, `deleteSentences`, `restoreSentences`, `reorderSentences`
- `getAgentContext()` returns formatted timeline state for Claude

## Changes Required

### 1. Simplify Pipeline Phase 3 (src/api/processingPipeline.ts)

**Location**: Lines 249-297

**Current code** (lines 266-293):
```typescript
try {
  const result = await requestAssemblyCut({
    segmentGroups: allGroups,
    sourceNames,
  });
  // ... use Claude's order
} catch (error) {
  console.error("[pipeline] Phase 3: Assembly cut FAILED:", error);
  orderedGroupIds = allGroups.map((g) => g.groupId);
}
```

**Change to**:
```typescript
// Always use chronological order - agentic assembly cut runs after timeline init
console.log(`[pipeline] Phase 3: Using chronological order (agentic assembly runs post-init)`);
orderedGroupIds = allGroups.map((g) => g.groupId);
```

Remove the entire try/catch block and the `requestAssemblyCut` call. The import for `requestAssemblyCut` can also be removed from line 6.

### 2. Create executeAgenticAssemblyCut (src/api/agenticEdit.ts)

Add a new exported function that reuses the existing infrastructure:

```typescript
const ASSEMBLY_CUT_SYSTEM_PROMPT = `You are an AI video editor assistant performing an initial assembly cut. Analyze the timeline and make it production-ready.

Your tasks:
1. Identify retakes - sentences that are duplicated or very similar content within a short time span. Keep the best take (usually more complete, higher confidence) and delete the others using delete_sentences.
2. Remove false starts - very short incomplete sentences that are followed by a complete version.
3. Reorder for narrative flow - if the content would make more sense in a different order, use reorder_sentences.
4. Remove off-topic tangents that don't fit the main narrative.

Guidelines:
- Be conservative - only delete clear duplicates/retakes, not unique content
- Look at Context hints (from visual descriptions) to understand what's happening
- Prefer keeping later takes over earlier ones (speaker usually improves)
- Work systematically, making multiple tool calls as needed
- After making changes, provide a brief summary of what you did

The timeline is currently in chronological order. Refine it for the best viewing experience.`;

export async function executeAgenticAssemblyCut(
  callbacks: AgenticEditCallbacks = {}
): Promise<AgenticEditResult> {
  console.log(`[agenticEdit] Starting assembly cut...`);

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[agenticEdit] No API key, skipping assembly cut");
    return {
      success: true,
      message: "Skipped assembly cut (no API key)",
      toolCallCount: 0,
      commandIds: [],
    };
  }

  const context = getAgentContext();

  // Check if there's enough content to warrant assembly cut
  const state = useProjectStore.getState();
  if (state.timeline.entries.length < 2) {
    console.log("[agenticEdit] Only 1 sentence, skipping assembly cut");
    return {
      success: true,
      message: "Skipped assembly cut (single sentence)",
      toolCallCount: 0,
      commandIds: [],
    };
  }

  const userMessage = `Current timeline state:

${context}

---

Please perform an assembly cut on this timeline. Identify and remove retakes/duplicates, and reorder for better narrative flow if needed.`;

  // Reuse the same streaming API call logic but with ASSEMBLY_CUT_SYSTEM_PROMPT
  // ... (same loop as executeAgenticEdit but with different system prompt)
}
```

**Implementation note**: Extract the common streaming loop into a shared helper, or duplicate with the different system prompt. The existing `streamingApiCall` already takes `messages` - you'd need to also parameterize the system prompt.

### 3. Update EditPage (src/pages/EditPage.tsx)

**Location**: Lines 75-86

**Current code**:
```typescript
setWords(result.words);
setSegmentGroups(result.segmentGroups);
setOrderedGroupIds(result.orderedGroupIds);
setSentences(result.sentences);
setTranscriptlessSourceIds(result.transcriptlessSourceIds);
initializeTimeline(result.sentences);
setPhase("ready");
setProgress(null);
```

**Change to**:
```typescript
setWords(result.words);
setSegmentGroups(result.segmentGroups);
setOrderedGroupIds(result.orderedGroupIds);
setSentences(result.sentences);
setTranscriptlessSourceIds(result.transcriptlessSourceIds);
initializeTimeline(result.sentences);

// Run agentic assembly cut (graceful fallback to chronological order)
setPhase("assembling");
try {
  await executeAgenticAssemblyCut({
    onToolStart: (name, input) => {
      console.log(`[assemblyCut] Tool: ${name}`, input);
    },
    onToolComplete: (name, result) => {
      console.log(`[assemblyCut] ${name}: ${result}`);
    },
  });
} catch (e) {
  console.warn("[assemblyCut] Failed, using chronological order:", e);
  // Timeline stays in chronological order - graceful fallback
}

setPhase("ready");
setProgress(null);
```

Add import at top:
```typescript
import { executeAgenticAssemblyCut } from "../api/agenticEdit";
```

### 4. Refactor streamingApiCall (src/api/agenticEdit.ts)

The current `streamingApiCall` uses a module-level `SYSTEM_PROMPT`. To support both regular edits and assembly cuts, either:

**Option A**: Add system prompt parameter
```typescript
async function streamingApiCall(
  apiKey: string,
  messages: Message[],
  callbacks: AgenticEditCallbacks,
  systemPrompt: string = SYSTEM_PROMPT  // default to existing
): Promise<{ content: ContentBlock[]; stopReason: string }>
```

**Option B**: Create a more generic `runAgenticLoop` helper that both functions use.

## Files to Modify

1. **src/api/processingPipeline.ts**
   - Remove `requestAssemblyCut` import (line 6)
   - Simplify Phase 3 (lines 249-297) to always use chronological order

2. **src/api/agenticEdit.ts**
   - Add `ASSEMBLY_CUT_SYSTEM_PROMPT` constant
   - Parameterize `streamingApiCall` to accept system prompt
   - Add `executeAgenticAssemblyCut` function

3. **src/pages/EditPage.tsx**
   - Import `executeAgenticAssemblyCut`
   - Call it after `initializeTimeline` with try/catch for graceful fallback

4. **src/api/assemblyCut.ts** (optional cleanup)
   - Can be deleted entirely once migration is complete
   - Or keep `groupWordsForAssembly` if still used (check imports)

## Testing the Change

1. **Happy path**: With valid `VITE_ANTHROPIC_API_KEY`
   - Pipeline completes, timeline initialized
   - Agentic assembly cut runs, identifies duplicates, reorders
   - Final timeline is refined

2. **No API key**: Remove `VITE_ANTHROPIC_API_KEY` from env
   - Pipeline completes, timeline initialized
   - Assembly cut skips gracefully
   - Timeline stays in chronological order

3. **Claude unavailable**: Mock API failure (e.g., wrong key)
   - Pipeline completes, timeline initialized
   - Assembly cut fails, caught by try/catch
   - Timeline stays in chronological order
   - User sees ready state, can manually edit

4. **Single sentence**: Only one sentence in timeline
   - Assembly cut skips (nothing to reorder)
   - No wasted API call

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/api/processingPipeline.ts` | Pipeline orchestration, Phase 3 to simplify |
| `src/api/agenticEdit.ts` | Agentic loop, add assembly cut function here |
| `src/api/assemblyCut.ts` | Old one-shot approach, can be removed |
| `src/stores/useAgenticStore.ts` | Tool implementations (already complete) |
| `src/pages/EditPage.tsx` | Integration point after timeline init |

## Status
- [x] Simplify pipeline Phase 3
- [x] Add executeAgenticAssemblyCut to agenticEdit.ts
- [x] Parameterize streamingApiCall for system prompt
- [x] Update EditPage to call assembly cut
- [x] Clean up assemblyCut.ts (kept groupWordsForAssembly, removed old API code)
- [x] Clean up unused types (DuplicateGroup, AssemblyCutRequest, AssemblyCutResult)
- [ ] Test happy path
- [ ] Test graceful fallback (no key)
- [ ] Test graceful fallback (API error)
