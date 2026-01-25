# Agentic Editing Loop - Implementation Plan

## Overview

Add an agentic loop that uses Claude's function calling (tool use) to edit video transcripts. The workflow has two phases:

1. **Sequencing Phase**: Claude receives grouped segments and determines the narrative order
2. **Editing Phase**: Claude fine-tunes by deleting words, swapping sentences, excluding content

Claude uses **direct IDs** (shown in context) - no fuzzy resolution needed. We just validate IDs exist.

---

## Phase 1: Sequencing

Before fine-grained editing, Claude sees all segments grouped by content/topic and determines the best narrative order.

### Input: Grouped Segments
```
SEGMENTS TO SEQUENCE:

[seg-1] source=Interview_Take1 | 0:00-0:15
    "So we started the company in 2019. The idea came from my cofounder who was frustrated with video editing."

[seg-2] source=Interview_Take1 | 0:15-0:28
    "Our first customer was actually my mom. She needed help editing her cooking videos."

[seg-3] source=Interview_Take2 | 0:00-0:12
    "The problem with existing tools is they're too complicated. We wanted something simple."

[seg-4] source=Interview_Take2 | 0:12-0:25
    "We raised our seed round in 2020. That let us hire our first engineers."

[seg-5] source=Interview_Take1 | 0:28-0:40
    "Looking back, the hardest part was finding product-market fit. It took us almost a year."
```

### Tool: `sequence_segments`
```typescript
interface SequenceSegmentsParams {
  orderedSegmentIds: string[];  // e.g., ["seg-1", "seg-3", "seg-2", "seg-4", "seg-5"]
  excludedSegmentIds: string[]; // Segments to exclude entirely
  reasoning: string;            // Explain the narrative structure
}
```
**Effect**: Creates the initial Timeline with sentences in the specified order.

### Example Claude Response
```json
{
  "name": "sequence_segments",
  "input": {
    "orderedSegmentIds": ["seg-1", "seg-3", "seg-4", "seg-2", "seg-5"],
    "excludedSegmentIds": [],
    "reasoning": "Start with company origin (seg-1), then the problem being solved (seg-3), then growth/funding (seg-4), then a customer story (seg-2), end with reflection (seg-5)"
  }
}
```

---

## Phase 2: Fine-Grained Editing

After sequencing, Claude can make word-level and sentence-level edits.

---

## Tool Definitions

### 0. `sequence_segments` (Phase 1 only)
```typescript
interface SequenceSegmentsParams {
  orderedSegmentIds: string[];
  excludedSegmentIds: string[];
  reasoning: string;
}
```
**Effect**: Sets initial timeline order from grouped segments.

### 1. `delete_words`
```typescript
interface DeleteWordsParams {
  sentenceId: string;    // e.g., "sent-1"
  wordIndices: number[]; // 0-indexed positions in sentence
  reason: string;
}
```
**Effect**: Adds word IDs to `excludedWordIds` on the TimelineEntry.

### 2. `restore_words`
```typescript
interface RestoreWordsParams {
  sentenceId: string;
  wordIndices: number[];
  reason: string;
}
```
**Effect**: Removes word IDs from `excludedWordIds`.

### 3. `swap_sentences`
```typescript
interface SwapSentencesParams {
  sentenceIdA: string;
  sentenceIdB: string;
  reason: string;
}
```
**Effect**: Swaps positions of two TimelineEntry items.

### 4. `move_sentence`
```typescript
interface MoveSentenceParams {
  sentenceId: string;
  toIndex: number;  // 0-indexed target position
  reason: string;
}
```
**Effect**: Moves TimelineEntry to new position.

### 5. `exclude_sentence`
```typescript
interface ExcludeSentenceParams {
  sentenceId: string;
  reason: string;
}
```
**Effect**: Sets `excluded: true` on TimelineEntry.

### 6. `restore_sentence`
```typescript
interface RestoreSentenceParams {
  sentenceId: string;
  reason: string;
}
```
**Effect**: Sets `excluded: false` on TimelineEntry.

### 7. `finish`
```typescript
interface FinishParams {
  summary: string;
}
```
**Effect**: Ends the loop, presents changes for user approval.

---

## Types

```typescript
// src/types/agentEdit.ts

// Phase 1: Sequencing
export type SequencingToolName = 'sequence_segments';

// Phase 2: Editing
export type EditingToolName =
  | 'delete_words'
  | 'restore_words'
  | 'swap_sentences'
  | 'move_sentence'
  | 'exclude_sentence'
  | 'restore_sentence'
  | 'finish';

export type ToolName = SequencingToolName | EditingToolName;

// Phase 1 params
export interface SequenceSegmentsParams {
  orderedSegmentIds: string[];
  excludedSegmentIds: string[];
  reasoning: string;
}

// Phase 2 params
export interface DeleteWordsParams {
  sentenceId: string;
  wordIndices: number[];
  reason: string;
}

export interface RestoreWordsParams {
  sentenceId: string;
  wordIndices: number[];
  reason: string;
}

export interface SwapSentencesParams {
  sentenceIdA: string;
  sentenceIdB: string;
  reason: string;
}

export interface MoveSentenceParams {
  sentenceId: string;
  toIndex: number;
  reason: string;
}

export interface ExcludeSentenceParams {
  sentenceId: string;
  reason: string;
}

export interface RestoreSentenceParams {
  sentenceId: string;
  reason: string;
}

export interface FinishParams {
  summary: string;
}

export type ToolParams =
  | { name: 'delete_words'; input: DeleteWordsParams }
  | { name: 'restore_words'; input: RestoreWordsParams }
  | { name: 'swap_sentences'; input: SwapSentencesParams }
  | { name: 'move_sentence'; input: MoveSentenceParams }
  | { name: 'exclude_sentence'; input: ExcludeSentenceParams }
  | { name: 'restore_sentence'; input: RestoreSentenceParams }
  | { name: 'finish'; input: FinishParams };

export interface AppliedEdit {
  toolName: ToolName;
  params: ToolParams['input'];
  timestamp: number;
}

export interface AgentSession {
  sessionId: string;
  messages: Message[];
  appliedEdits: AppliedEdit[];
  workingTimeline: Timeline;
  status: 'running' | 'completed' | 'error';
}

interface Message {
  role: 'user' | 'assistant' | 'tool_result';
  content: string | ToolUseBlock[];
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: ToolName;
  input: Record<string, unknown>;
}
```

---

## Context Format

```
TIMELINE (4 sentences, 0:12 total)

SOURCES:
- src-1: "Interview.mp4"

SENTENCES:
[0] id=sent-1 | source=src-1 | 0:00-0:03
    "So um we started the company."
    words: [0:So] [1:um] [2:we] [3:started] [4:the] [5:company]

[1] id=sent-2 | source=src-1 | 0:03-0:06
    "The idea came from my cofounder."
    words: [0:The] [1:idea] [2:came] [3:from] [4:my] [5:cofounder]

[2] id=sent-3 | source=src-1 | EXCLUDED
    "We wanted to solve video editing."
    words: [0:We] [1:wanted] [2:to] [3:solve] [4:video] [5:editing]

[3] id=sent-4 | source=src-1 | 0:06-0:09
    "Our first customer was my mom."
    words: [0:Our] [1:first] [2:customer] [3:was] [4:~~my~~] [5:mom]
    ^ word 4 excluded

USER INSTRUCTIONS:
"Remove filler words like um."
```

Key points:
- Sentence index shown as `[0]`, `[1]`, etc.
- Sentence ID shown as `id=sent-1`
- Words indexed `[0:word]`, `[1:word]`, etc.
- Excluded words shown as `[4:~~my~~]`
- Excluded sentences marked `EXCLUDED`

---

## Tool Schemas (Claude API)

```typescript
// src/api/agentEdit.ts

// Phase 1: Sequencing tool
export const SEQUENCING_TOOLS = [
  {
    name: 'sequence_segments',
    description: 'Set the narrative order of segments. Call this once to establish the timeline structure.',
    input_schema: {
      type: 'object',
      properties: {
        orderedSegmentIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Segment IDs in desired narrative order'
        },
        excludedSegmentIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Segment IDs to exclude from the cut'
        },
        reasoning: {
          type: 'string',
          description: 'Explain the narrative structure and why this order works'
        }
      },
      required: ['orderedSegmentIds', 'excludedSegmentIds', 'reasoning']
    }
  }
];

// Phase 2: Editing tools
export const EDIT_TOOLS = [
  {
    name: 'delete_words',
    description: 'Delete words from a sentence by index.',
    input_schema: {
      type: 'object',
      properties: {
        sentenceId: { type: 'string', description: 'Sentence ID (e.g., "sent-1")' },
        wordIndices: {
          type: 'array',
          items: { type: 'number' },
          description: 'Word indices to delete (0-indexed)'
        },
        reason: { type: 'string', description: 'Why deleting these words' }
      },
      required: ['sentenceId', 'wordIndices', 'reason']
    }
  },
  {
    name: 'restore_words',
    description: 'Restore previously deleted words by index.',
    input_schema: {
      type: 'object',
      properties: {
        sentenceId: { type: 'string', description: 'Sentence ID' },
        wordIndices: {
          type: 'array',
          items: { type: 'number' },
          description: 'Word indices to restore (0-indexed)'
        },
        reason: { type: 'string', description: 'Why restoring these words' }
      },
      required: ['sentenceId', 'wordIndices', 'reason']
    }
  },
  {
    name: 'swap_sentences',
    description: 'Swap the positions of two sentences.',
    input_schema: {
      type: 'object',
      properties: {
        sentenceIdA: { type: 'string', description: 'First sentence ID' },
        sentenceIdB: { type: 'string', description: 'Second sentence ID' },
        reason: { type: 'string', description: 'Why swapping improves flow' }
      },
      required: ['sentenceIdA', 'sentenceIdB', 'reason']
    }
  },
  {
    name: 'move_sentence',
    description: 'Move a sentence to a new position.',
    input_schema: {
      type: 'object',
      properties: {
        sentenceId: { type: 'string', description: 'Sentence ID to move' },
        toIndex: { type: 'number', description: 'Target position (0-indexed)' },
        reason: { type: 'string', description: 'Why this move improves flow' }
      },
      required: ['sentenceId', 'toIndex', 'reason']
    }
  },
  {
    name: 'exclude_sentence',
    description: 'Exclude a sentence from the final cut.',
    input_schema: {
      type: 'object',
      properties: {
        sentenceId: { type: 'string', description: 'Sentence ID to exclude' },
        reason: { type: 'string', description: 'Why excluding this sentence' }
      },
      required: ['sentenceId', 'reason']
    }
  },
  {
    name: 'restore_sentence',
    description: 'Restore a previously excluded sentence.',
    input_schema: {
      type: 'object',
      properties: {
        sentenceId: { type: 'string', description: 'Sentence ID to restore' },
        reason: { type: 'string', description: 'Why restoring this sentence' }
      },
      required: ['sentenceId', 'reason']
    }
  },
  {
    name: 'finish',
    description: 'Signal editing is complete.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Summary of all changes made' }
      },
      required: ['summary']
    }
  }
];
```

---

## System Prompt

```typescript
export function buildSystemPrompt(userInstructions?: string): string {
  return `You are an expert video editor. Your job is to clean up this transcript.

EDITING GUIDELINES:
- Remove filler words (um, uh, like, you know, so, actually)
- Remove false starts and repeated phrases
- Reorder sentences for better narrative flow
- Exclude irrelevant or redundant sentences

TOOLS:
- delete_words(sentenceId, wordIndices[], reason): Remove words by index
- restore_words(sentenceId, wordIndices[], reason): Restore deleted words
- swap_sentences(sentenceIdA, sentenceIdB, reason): Swap two sentences
- move_sentence(sentenceId, toIndex, reason): Move sentence to position
- exclude_sentence(sentenceId, reason): Remove sentence from cut
- restore_sentence(sentenceId, reason): Restore excluded sentence
- finish(summary): Complete editing

RULES:
1. Use exact sentence IDs (e.g., "sent-1")
2. Use 0-indexed word positions
3. Always provide a reason
4. Call finish() when done

${userInstructions ? `USER INSTRUCTIONS:\n${userInstructions}\n` : ''}
Review the timeline and make edits.`;
}
```

---

## Format Function

```typescript
export function formatTimeline(
  timeline: Timeline,
  sentences: Sentence[],
  words: Word[],
  sources: Source[]
): string {
  const lines: string[] = [];

  // Header
  const included = timeline.entries.filter(e => !e.excluded);
  const totalDuration = included.reduce((sum, e) => {
    const s = sentences.find(s => s.sentenceId === e.sentenceId);
    return sum + (s ? s.endTime - s.startTime : 0);
  }, 0);
  lines.push(`TIMELINE (${timeline.entries.length} sentences, ${formatDuration(totalDuration)} total)\n`);

  // Sources
  lines.push('SOURCES:');
  for (const source of sources) {
    lines.push(`- ${source.id}: "${source.name}"`);
  }
  lines.push('');

  // Sentences
  lines.push('SENTENCES:');
  for (let i = 0; i < timeline.entries.length; i++) {
    const entry = timeline.entries[i];
    const sentence = sentences.find(s => s.sentenceId === entry.sentenceId);
    if (!sentence) continue;

    const source = sources.find(s => s.id === entry.sourceId);
    const status = entry.excluded
      ? 'EXCLUDED'
      : `${formatDuration(sentence.startTime)}-${formatDuration(sentence.endTime)}`;

    lines.push(`[${i}] id=${entry.sentenceId} | source=${entry.sourceId} | ${status}`);
    lines.push(`    "${entry.text}"`);

    // Words with indices
    const wordTokens = sentence.wordIds.map((wid, idx) => {
      const word = words.find(w => w.id === wid);
      if (!word) return `[${idx}:?]`;
      const excluded = entry.excludedWordIds.includes(wid);
      return excluded ? `[${idx}:~~${word.word}~~]` : `[${idx}:${word.word}]`;
    });
    lines.push(`    words: ${wordTokens.join(' ')}`);

    // Note excluded words
    const excludedIndices = sentence.wordIds
      .map((wid, idx) => entry.excludedWordIds.includes(wid) ? idx : -1)
      .filter(idx => idx !== -1);
    if (excludedIndices.length > 0) {
      lines.push(`    ^ words ${excludedIndices.join(', ')} excluded`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

---

## Validation Functions

```typescript
export function validateToolCall(
  toolName: ToolName,
  input: Record<string, unknown>,
  timeline: Timeline,
  sentences: Sentence[]
): { valid: true } | { valid: false; error: string } {

  if (toolName === 'delete_words' || toolName === 'restore_words') {
    const { sentenceId, wordIndices } = input as { sentenceId: string; wordIndices: number[] };

    const entry = timeline.entries.find(e => e.sentenceId === sentenceId);
    if (!entry) return { valid: false, error: `Sentence ${sentenceId} not found` };

    const sentence = sentences.find(s => s.sentenceId === sentenceId);
    if (!sentence) return { valid: false, error: `Sentence ${sentenceId} not found` };

    for (const idx of wordIndices) {
      if (idx < 0 || idx >= sentence.wordIds.length) {
        return { valid: false, error: `Word index ${idx} out of range (0-${sentence.wordIds.length - 1})` };
      }
    }
    return { valid: true };
  }

  if (toolName === 'swap_sentences') {
    const { sentenceIdA, sentenceIdB } = input as { sentenceIdA: string; sentenceIdB: string };
    if (!timeline.entries.find(e => e.sentenceId === sentenceIdA)) {
      return { valid: false, error: `Sentence ${sentenceIdA} not found` };
    }
    if (!timeline.entries.find(e => e.sentenceId === sentenceIdB)) {
      return { valid: false, error: `Sentence ${sentenceIdB} not found` };
    }
    return { valid: true };
  }

  if (toolName === 'move_sentence') {
    const { sentenceId, toIndex } = input as { sentenceId: string; toIndex: number };
    if (!timeline.entries.find(e => e.sentenceId === sentenceId)) {
      return { valid: false, error: `Sentence ${sentenceId} not found` };
    }
    if (toIndex < 0 || toIndex >= timeline.entries.length) {
      return { valid: false, error: `Index ${toIndex} out of range (0-${timeline.entries.length - 1})` };
    }
    return { valid: true };
  }

  if (toolName === 'exclude_sentence' || toolName === 'restore_sentence') {
    const { sentenceId } = input as { sentenceId: string };
    if (!timeline.entries.find(e => e.sentenceId === sentenceId)) {
      return { valid: false, error: `Sentence ${sentenceId} not found` };
    }
    return { valid: true };
  }

  if (toolName === 'finish') {
    return { valid: true };
  }

  return { valid: false, error: `Unknown tool: ${toolName}` };
}
```

---

## Apply Edit Functions

```typescript
export function applyEdit(
  timeline: Timeline,
  sentences: Sentence[],
  toolName: ToolName,
  input: Record<string, unknown>
): Timeline {
  const newTimeline = structuredClone(timeline);

  switch (toolName) {
    case 'delete_words': {
      const { sentenceId, wordIndices } = input as DeleteWordsParams;
      const entry = newTimeline.entries.find(e => e.sentenceId === sentenceId)!;
      const sentence = sentences.find(s => s.sentenceId === sentenceId)!;
      for (const idx of wordIndices) {
        const wordId = sentence.wordIds[idx];
        if (!entry.excludedWordIds.includes(wordId)) {
          entry.excludedWordIds.push(wordId);
        }
      }
      break;
    }

    case 'restore_words': {
      const { sentenceId, wordIndices } = input as RestoreWordsParams;
      const entry = newTimeline.entries.find(e => e.sentenceId === sentenceId)!;
      const sentence = sentences.find(s => s.sentenceId === sentenceId)!;
      for (const idx of wordIndices) {
        const wordId = sentence.wordIds[idx];
        entry.excludedWordIds = entry.excludedWordIds.filter(id => id !== wordId);
      }
      break;
    }

    case 'swap_sentences': {
      const { sentenceIdA, sentenceIdB } = input as SwapSentencesParams;
      const idxA = newTimeline.entries.findIndex(e => e.sentenceId === sentenceIdA);
      const idxB = newTimeline.entries.findIndex(e => e.sentenceId === sentenceIdB);
      [newTimeline.entries[idxA], newTimeline.entries[idxB]] =
        [newTimeline.entries[idxB], newTimeline.entries[idxA]];
      break;
    }

    case 'move_sentence': {
      const { sentenceId, toIndex } = input as MoveSentenceParams;
      const fromIndex = newTimeline.entries.findIndex(e => e.sentenceId === sentenceId);
      const [entry] = newTimeline.entries.splice(fromIndex, 1);
      newTimeline.entries.splice(toIndex, 0, entry);
      break;
    }

    case 'exclude_sentence': {
      const { sentenceId } = input as ExcludeSentenceParams;
      const entry = newTimeline.entries.find(e => e.sentenceId === sentenceId)!;
      entry.excluded = true;
      break;
    }

    case 'restore_sentence': {
      const { sentenceId } = input as RestoreSentenceParams;
      const entry = newTimeline.entries.find(e => e.sentenceId === sentenceId)!;
      entry.excluded = false;
      break;
    }

    case 'finish':
      // No-op, just signals completion
      break;
  }

  newTimeline.version += 1;
  return newTimeline;
}
```

---

## Agent Loop (Two Phases)

### Phase 1: Sequencing

```typescript
export async function runSequencingPhase(
  segmentGroups: SegmentGroup[],
  sources: Source[],
  userInstructions?: string
): Promise<{ orderedIds: string[]; excludedIds: string[]; reasoning: string }> {

  const systemPrompt = buildSequencingPrompt(userInstructions);
  const contextMessage = formatSegmentsForSequencing(segmentGroups, sources);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools: SEQUENCING_TOOLS,
      messages: [{ role: 'user', content: contextMessage }]
    })
  });

  const data = await response.json();
  const toolUse = data.content.find((b: any) => b.type === 'tool_use');

  if (!toolUse || toolUse.name !== 'sequence_segments') {
    throw new Error('Agent did not call sequence_segments');
  }

  const { orderedSegmentIds, excludedSegmentIds, reasoning } = toolUse.input;

  // Validate all IDs exist
  const allIds = segmentGroups.map(g => g.groupId);
  for (const id of [...orderedSegmentIds, ...excludedSegmentIds]) {
    if (!allIds.includes(id)) {
      throw new Error(`Unknown segment ID: ${id}`);
    }
  }

  return { orderedIds: orderedSegmentIds, excludedIds: excludedSegmentIds, reasoning };
}

function buildSequencingPrompt(userInstructions?: string): string {
  return `You are an expert video editor. Your job is to determine the best narrative order for these video segments.

GUIDELINES:
- Create a logical narrative flow (intro → problem → solution → results → conclusion)
- Group related content together
- Exclude redundant or off-topic segments
- Consider pacing and viewer engagement

Call sequence_segments with:
- orderedSegmentIds: Segment IDs in your desired order
- excludedSegmentIds: Segment IDs to cut entirely
- reasoning: Explain your narrative structure

${userInstructions ? `USER INSTRUCTIONS:\n${userInstructions}\n` : ''}`;
}

function formatSegmentsForSequencing(
  segmentGroups: SegmentGroup[],
  sources: Source[]
): string {
  const lines: string[] = ['SEGMENTS TO SEQUENCE:\n'];

  for (const group of segmentGroups) {
    const source = sources.find(s => s.id === group.sourceId);
    const duration = group.endTime - group.startTime;
    lines.push(`[${group.groupId}] source=${source?.name || group.sourceId} | ${formatDuration(group.startTime)}-${formatDuration(group.endTime)} (${duration.toFixed(1)}s)`);
    lines.push(`    "${group.text}"`);
    lines.push('');
  }

  return lines.join('\n');
}
```

### Phase 2: Fine-Grained Editing

```typescript
export async function runEditingPhase(
  timeline: Timeline,
  sentences: Sentence[],
  words: Word[],
  sources: Source[],
  userInstructions?: string
): Promise<{ finalTimeline: Timeline; edits: AppliedEdit[]; summary: string }> {

  let workingTimeline = structuredClone(timeline);
  const edits: AppliedEdit[] = [];
  const messages: Message[] = [];

  const systemPrompt = buildEditingPrompt(userInstructions);
  const contextMessage = formatTimeline(workingTimeline, sentences, words, sources);

  messages.push({ role: 'user', content: contextMessage });

  while (true) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools: EDIT_TOOLS,
        messages
      })
    });

    const data = await response.json();
    const toolUseBlocks = data.content.filter((b: any) => b.type === 'tool_use');

    if (toolUseBlocks.length === 0) {
      throw new Error('Agent did not call any tools');
    }

    for (const toolUse of toolUseBlocks) {
      const { id, name, input } = toolUse;

      const validation = validateToolCall(name, input, workingTimeline, sentences);

      if (!validation.valid) {
        messages.push({ role: 'assistant', content: data.content });
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: id, content: `Error: ${validation.error}` }]
        });
        continue;
      }

      if (name === 'finish') {
        const { summary } = input as FinishParams;
        return { finalTimeline: workingTimeline, edits, summary };
      }

      workingTimeline = applyEdit(workingTimeline, sentences, name, input);
      edits.push({ toolName: name, params: input, timestamp: Date.now() });

      messages.push({ role: 'assistant', content: data.content });
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: id,
          content: `Success. Updated timeline:\n${formatTimeline(workingTimeline, sentences, words, sources)}`
        }]
      });
    }

    if (edits.length > 100) {
      throw new Error('Agent exceeded max edits (100)');
    }
  }
}

function buildEditingPrompt(userInstructions?: string): string {
  return `You are an expert video editor. The narrative order has been set. Now clean up the transcript.

EDITING GUIDELINES:
- Remove filler words (um, uh, like, you know, so, actually)
- Remove false starts and repeated phrases
- Fine-tune sentence order if needed
- Exclude any remaining irrelevant sentences

TOOLS:
- delete_words(sentenceId, wordIndices[], reason)
- restore_words(sentenceId, wordIndices[], reason)
- swap_sentences(sentenceIdA, sentenceIdB, reason)
- move_sentence(sentenceId, toIndex, reason)
- exclude_sentence(sentenceId, reason)
- restore_sentence(sentenceId, reason)
- finish(summary)

${userInstructions ? `USER INSTRUCTIONS:\n${userInstructions}\n` : ''}
Make your edits, then call finish().`;
}
```

### Full Pipeline

```typescript
export async function runAgentPipeline(
  segmentGroups: SegmentGroup[],
  sentences: Sentence[],
  words: Word[],
  sources: Source[],
  userInstructions?: string
): Promise<{ timeline: Timeline; edits: AppliedEdit[]; summary: string }> {

  // Phase 1: Sequence segments
  const { orderedIds, excludedIds, reasoning } = await runSequencingPhase(
    segmentGroups,
    sources,
    userInstructions
  );

  console.log('[Agent] Sequencing complete:', reasoning);

  // Build initial timeline from sequencing result
  const timeline = buildTimelineFromSequence(
    orderedIds,
    excludedIds,
    segmentGroups,
    sentences
  );

  // Phase 2: Fine-grained editing
  const { finalTimeline, edits, summary } = await runEditingPhase(
    timeline,
    sentences,
    words,
    sources,
    userInstructions
  );

  return { timeline: finalTimeline, edits, summary };
}

function buildTimelineFromSequence(
  orderedIds: string[],
  excludedIds: string[],
  segmentGroups: SegmentGroup[],
  sentences: Sentence[]
): Timeline {
  const entries: TimelineEntry[] = [];

  for (const groupId of orderedIds) {
    const group = segmentGroups.find(g => g.groupId === groupId);
    if (!group) continue;

    // Find sentences that belong to this group
    const groupSentences = sentences.filter(s => s.originalGroupId === groupId);

    for (const sentence of groupSentences) {
      entries.push({
        sentenceId: sentence.sentenceId,
        text: sentence.text,
        sourceId: sentence.sourceId,
        excluded: false,
        excludedWordIds: []
      });
    }
  }

  // Add excluded segments
  for (const groupId of excludedIds) {
    const group = segmentGroups.find(g => g.groupId === groupId);
    if (!group) continue;

    const groupSentences = sentences.filter(s => s.originalGroupId === groupId);

    for (const sentence of groupSentences) {
      entries.push({
        sentenceId: sentence.sentenceId,
        text: sentence.text,
        sourceId: sentence.sourceId,
        excluded: true,
        excludedWordIds: []
      });
    }
  }

  return { version: 1, entries };
}
```

---

## Step-by-Step Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 1: SEQUENCING                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User clicks "AI Edit" with optional instructions            │
│                          ↓                                      │
│  2. Format segment groups for Claude:                           │
│     [seg-1] "So we started the company..."                      │
│     [seg-2] "Our first customer was..."                         │
│     [seg-3] "The problem with existing tools..."                │
│                          ↓                                      │
│  3. Send to Claude with SEQUENCING_TOOLS                        │
│                          ↓                                      │
│  4. Claude responds:                                            │
│     sequence_segments({                                         │
│       orderedSegmentIds: ["seg-1", "seg-3", "seg-2"],           │
│       excludedSegmentIds: [],                                   │
│       reasoning: "Origin story → Problem → Customer example"   │
│     })                                                          │
│                          ↓                                      │
│  5. Build Timeline from ordered segments                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│                   PHASE 2: FINE-GRAINED EDITING                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  6. Format timeline with word-level detail:                     │
│     [0] id=sent-1 | words: [0:So] [1:um] [2:we]...              │
│                          ↓                                      │
│  7. Send to Claude with EDIT_TOOLS                              │
│                          ↓                                      │
│  8. Claude responds:                                            │
│     delete_words({                                              │
│       sentenceId: "sent-1",                                     │
│       wordIndices: [1],                                         │
│       reason: "filler word"                                     │
│     })                                                          │
│                          ↓                                      │
│  9. Validate → Apply edit → Send updated context                │
│                          ↓                                      │
│  10. Repeat until Claude calls finish()                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│                      USER APPROVAL                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  11. Show diff: original vs edited timeline                     │
│                          ↓                                      │
│  12. User approves → apply to real timeline                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Stages

### Stage 1: Types
**File**: `src/types/agentEdit.ts`
- All interfaces and types (including `SequenceSegmentsParams`)
**Status**: Not Started

### Stage 2: Sequencing Phase
**File**: `src/api/agentEdit.ts`
- `SEQUENCING_TOOLS` constant
- `buildSequencingPrompt()`
- `formatSegmentsForSequencing()`
- `runSequencingPhase()`
- `buildTimelineFromSequence()`
**Status**: Not Started

### Stage 3: Editing Phase
**File**: `src/api/agentEdit.ts`
- `EDIT_TOOLS` constant
- `buildEditingPrompt()`
- `formatTimeline()`
- `validateToolCall()`
- `applyEdit()`
- `runEditingPhase()`
**Status**: Not Started

### Stage 4: Full Pipeline
**File**: `src/api/agentEdit.ts`
- `runAgentPipeline()` - orchestrates both phases
**Status**: Not Started

### Stage 5: UI Integration
**File**: `src/components/edit/AgentEditButton.tsx`
- Button to trigger agent
- Progress indicator (shows current phase)
- Diff view for approval
**Status**: Not Started

---

## Data Structure Alignment

This plan uses the existing types from `src/types/index.ts`:

### Existing Types Used

| Type | Location | Used For |
|------|----------|----------|
| `SegmentGroup` | `index.ts:68-76` | Phase 1 input - groups of related content |
| `Sentence` | `index.ts:80-88` | Phase 2 editing unit, links to group via `originalGroupId` |
| `Word` | `index.ts:32-39` | Word-level editing, has `id`, `word`, `start`, `end` |
| `Timeline` | `index.ts:107-110` | Edit state container |
| `TimelineEntry` | `index.ts:98-105` | Per-sentence edit state with `excluded`, `excludedWordIds` |
| `Source` | `index.ts:19-27` | Video source metadata |

### Key Fields

```typescript
// SegmentGroup - used in Phase 1 sequencing
interface SegmentGroup {
  groupId: string;        // Used as segment ID in sequencing
  sourceId: string;
  text: string;           // Full text shown to Claude
  startTime: number;
  endTime: number;
}

// Sentence - links to group, used in Phase 2
interface Sentence {
  sentenceId: string;     // Used as sentence ID in editing
  wordIds: string[];      // Maps to Word.id for word-level edits
  originalGroupId?: string; // Links back to SegmentGroup.groupId
}

// TimelineEntry - edit state per sentence
interface TimelineEntry {
  sentenceId: string;
  excluded: boolean;      // Set by exclude_sentence/restore_sentence
  excludedWordIds: string[]; // Set by delete_words/restore_words
}
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ EXISTING PIPELINE (processingPipeline.ts)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Transcribe video → Word[]                                   │
│  2. Group words → SegmentGroup[] (groupWordsForAssembly)        │
│  3. Split into sentences → Sentence[] (with originalGroupId)    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ NEW AGENT PIPELINE (agentEdit.ts)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  4. Phase 1: sequence_segments(SegmentGroup[])                  │
│     → orderedIds, excludedIds                                   │
│                                                                 │
│  5. buildTimelineFromSequence()                                 │
│     → Timeline with entries ordered by segment sequence         │
│     → Uses Sentence.originalGroupId to find sentences per group │
│                                                                 │
│  6. Phase 2: edit loop with Timeline + Sentence[] + Word[]      │
│     → Modified Timeline with excluded sentences/words           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ OUTPUT                                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Final Timeline ready for:                                      │
│  - useTimelineSegments() → Segment[] for playback               │
│  - Export via Remotion                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Integration Point

The agent pipeline should be called from `processingPipeline.ts` after grouping, replacing the current `requestAssemblyCut()` call:

```typescript
// In runPipeline(), after grouping:

// OLD:
// const assemblyCutResult = await requestAssemblyCut({ segmentGroups, sourceNames });

// NEW:
const { timeline, edits, summary } = await runAgentPipeline(
  segmentGroups,
  sentences,
  words,
  sources,
  userInstructions
);
```

---

## Notes

- Claude uses **direct IDs** from context - no fuzzy matching needed
- Validation is simple: check ID exists, index in range
- Each tool result includes updated timeline so Claude sees current state
- Max 100 edits as safety limit
- Working copy until user approves
- Uses existing `Sentence.originalGroupId` to link sentences back to segment groups
