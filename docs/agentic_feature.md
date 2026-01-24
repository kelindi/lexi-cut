# Agentic Video Editing Loop — Implementation Spec

## Overview

Build an interactive agentic loop where Claude acts as a video editing assistant. Claude receives segment data, iteratively calls tools (reorder, mark duplicates), and the user approves each step via a chat UI before the next iteration.

**Current state**: Claude is called once in `src/api/assemblyCut.ts` with a fixed prompt. No tool use, no iteration, no multi-turn conversation.

**Target state**: Claude runs in a tool-use loop — it reasons about the edit, calls tools to mutate state, the user sees and approves, and the loop continues until Claude is satisfied.

---

## Input Interface

```typescript
interface AgentLoopInput {
  segmentGroups: SegmentGroup[];              // grouped phrases with timestamps
  segments: Segment[];                        // word-level segments (carries .description from Gemini)
  sourceNames: Record<string, string>;        // sourceId → filename
}
```

- `SegmentGroup` has `segmentIds` which map to `Segment[]`
- `Segment.description` holds the Gemini visual description (what's happening on screen)
- Claude uses `group.segmentIds` → looks up segments → reads `.description` for visual context
- Descriptions are NOT duplicated onto SegmentGroup — they stay on Segment as single source of truth so edits propagate

### Existing Types (from `src/types/index.ts`)

```typescript
interface SegmentGroup {
  groupId: string;
  sourceId: string;
  segmentIds: string[];
  text: string;           // transcribed phrase
  startTime: number;
  endTime: number;
  avgConfidence: number;
}

interface Segment {
  id: string;
  description?: string;   // Gemini visual description
  text?: TextLayer;
  video?: VideoLayer;
  audio?: AudioLayer;
}
```

---

## Output Interface

The agentic loop builds this state incrementally via tool calls:

```typescript
interface AgentEditState {
  orderedGroupIds: string[];     // current sequence (mutated by reorder tool)
  duplicates: DuplicateGroup[];  // accumulated duplicate marks
  removedGroupIds: string[];     // groups excluded from final cut
}
```

Final output must be compatible with `PipelineResult.orderedGroupIds` so it plugs into the existing timeline/player.

---

## API Structure — Claude Tool Use

### Request Shape

```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 4096,
  "system": "You are a video editing assistant...",
  "tools": [ /* tool definitions */ ],
  "messages": [ /* conversation history */ ]
}
```

### Tool Definitions

```typescript
const tools = [
  {
    name: "reorder_segments",
    description: "Reorder segment groups into a new sequence for the timeline",
    input_schema: {
      type: "object",
      properties: {
        ordered_group_ids: {
          type: "array",
          items: { type: "string" },
          description: "Group IDs in desired playback order"
        }
      },
      required: ["ordered_group_ids"]
    }
  },
  {
    name: "mark_duplicates",
    description: "Mark groups as duplicates/retakes and pick the best take",
    input_schema: {
      type: "object",
      properties: {
        phrase: { type: "string", description: "The repeated phrase" },
        group_ids: { type: "array", items: { type: "string" }, description: "All group IDs saying this phrase" },
        recommended_group_id: { type: "string", description: "Best take to keep" },
        reason: { type: "string", description: "Why this take is best" }
      },
      required: ["phrase", "group_ids", "recommended_group_id", "reason"]
    }
  },
  {
    name: "finish",
    description: "Signal that the assembly cut is complete and no more edits are needed",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Brief summary of edits made" }
      },
      required: ["summary"]
    }
  }
];
```

### Response When Claude Calls a Tool

```json
{
  "stop_reason": "tool_use",
  "content": [
    { "type": "text", "text": "I notice groups 3 and 7 are retakes..." },
    {
      "type": "tool_use",
      "id": "toolu_01A09q90qw90lq917835lq9",
      "name": "mark_duplicates",
      "input": {
        "phrase": "Welcome to the show",
        "group_ids": ["group-3", "group-7"],
        "recommended_group_id": "group-3",
        "reason": "Higher confidence (0.95 vs 0.87)"
      }
    }
  ]
}
```

### Sending Tool Results Back

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
      "content": "Done. Group-7 marked as duplicate. Group-3 kept."
    }
  ]
}
```

---

## Loop Flow

```
1. Build initial message with segment groups + descriptions
2. Send to Claude with tools defined
3. Claude responds:
   - stop_reason = "tool_use" → show user what Claude wants to do
   - stop_reason = "end_turn" → done (or Claude called "finish" tool)
4. User approves/rejects the tool call
5. If approved: execute tool (mutate AgentEditState), send tool_result back
6. If rejected: send tool_result with is_error: true and rejection reason
7. Go to step 3
```

---

## UX — Interactive Chat UI

- Chat-style interface showing Claude's reasoning + tool calls
- Each tool call renders as a card the user can approve/reject
- Tool results show what changed (e.g., "Reordered: group-2 moved before group-1")
- Final state displayed as the new timeline order
- Located as a component in `src/components/test/` or `src/components/agent/`

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/types/index.ts` | Modify | Add `AgentEditState`, `AgentMessage`, `AgentToolCall` types |
| `src/api/agentLoop.ts` | Create | Core agentic loop logic — sends messages, handles tool_use responses |
| `src/components/agent/AgentChat.tsx` | Create | Interactive chat UI with approve/reject |
| `src/pages/TestPage.tsx` | Modify | Add Agent section |

---

## Key Decisions Made

1. **Descriptions stay on `Segment`** — not duplicated to `SegmentGroup`. Claude accesses them via `segmentIds` lookup. This keeps a single source of truth and means description edits propagate automatically.
2. **User approves each step** — not auto-run. The loop pauses after each tool call for human review.
3. **Interactive chat UI** — not background pipeline. User sees Claude's reasoning in real-time.
4. **Tools: reorder + mark duplicates + finish** — matches current `AssemblyCutResult` capabilities but iterative.
5. **Output compatible with `PipelineResult`** — `orderedGroupIds` plugs directly into existing timeline.

---

## Existing Patterns to Follow

- API calls use `fetch` from `@tauri-apps/plugin-http` (see `assemblyCut.ts`, `gemini.ts`)
- For browser testing, add `"anthropic-dangerous-direct-browser-access": "true"` header (see `ClaudeTest.tsx`)
- API key from `import.meta.env.VITE_ANTHROPIC_API_KEY`
- UI uses Tailwind CSS, `@phosphor-icons/react`, dark theme (neutral-800/900 backgrounds)
- Test components live in `src/components/test/`
