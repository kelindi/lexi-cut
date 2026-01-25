# Agentic Editing System

This document describes the agentic editing system in Lexi-Cut, which allows Claude to act as an AI video editor assistant with tool-use capabilities.

## Overview

The agentic editing system enables natural language editing commands like "Remove all the ums and ahs" or "Delete repeated words". Claude receives the full timeline context, reasons about what edits to make, and executes tool calls in a loop until the task is complete.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  ConversationPanel  │────▶│   executeAgenticEdit │────▶│   Claude API        │
│  (UI)               │     │   (API)              │     │   (Streaming)       │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
                                      │                           │
                                      ▼                           │
                            ┌──────────────────────┐              │
                            │   useAgenticStore    │◀─────────────┘
                            │   (Tool Execution)   │     (tool_use responses)
                            └──────────────────────┘
                                      │
                                      ▼
                            ┌──────────────────────┐
                            │   useHistoryStore    │
                            │   (Selective Undo)   │
                            └──────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| [agenticEdit.ts](../src/api/agenticEdit.ts) | Core API - streaming Claude integration with tool-use loop |
| [useAgenticStore.ts](../src/stores/useAgenticStore.ts) | Tool execution facade with history tracking |
| [useHistoryStore.ts](../src/stores/useHistoryStore.ts) | Command history for selective undo |
| [ConversationPanel.tsx](../src/components/edit/ConversationPanel.tsx) | Chat UI for agentic editing |
| [ConversationInput.tsx](../src/components/edit/ConversationInput.tsx) | Input component with suggestion chips |

## Available Tools

Claude has access to 5 editing tools:

### 1. `delete_words`
Remove specific words from a sentence by their IDs.

```typescript
{
  sentence_id: string,  // ID of the sentence
  word_ids: string[]    // Array of word IDs to delete
}
```

**Use cases**: Removing filler words (um, uh, like), stutters, or unwanted words.

### 2. `restore_words`
Bring back previously deleted words.

```typescript
{
  sentence_id: string,  // ID of the sentence
  word_ids: string[]    // Array of word IDs to restore
}
```

**Use cases**: Undoing word deletions, correcting mistakes.

### 3. `delete_sentences`
Remove entire sentences from the timeline.

```typescript
{
  sentence_ids: string[]  // Array of sentence IDs to delete
}
```

**Use cases**: Removing duplicates/retakes, off-topic content, or unwanted sections.

### 4. `restore_sentences`
Bring back previously deleted sentences.

```typescript
{
  sentence_ids: string[]  // Array of sentence IDs to restore
}
```

**Use cases**: Undoing sentence deletions.

### 5. `reorder_sentences`
Change the order of sentences in the timeline.

```typescript
{
  sentence_ids: string[]  // All active sentence IDs in desired new order
}
```

**Use cases**: Improving narrative flow, fixing sequence, creative restructuring.

## How It Works

### 1. User Input
User types a natural language command in the conversation panel, e.g., "Remove all filler words".

### 2. Context Building
The system builds a detailed context string containing:
- All sentences with their IDs
- All words with their IDs
- Which items are excluded (marked with `~` prefix)
- Visual description context from sources (if available)

Example context format:
```
TIMELINE STATE (5 sentences, 0 excluded)
=========================================

[1] sentence-abc123 (ACTIVE)
    Context: Host introduces the topic
    "Welcome to the show today we're going to..."
    Words: [w-1]Welcome [w-2]to [w-3]the [w-4]~um [w-5]show...
    (1 word(s) excluded, marked with ~)

[2] sentence-def456 (ACTIVE)
    ...
```

### 3. Streaming API Call
The request is sent to Claude with:
- System prompt explaining the editing assistant role
- Tool definitions
- Conversation history
- SSE streaming enabled for real-time text updates

### 4. Tool-Use Loop
Claude reasons about the edit and may call tools. The loop continues:

```
Claude response → tool_use? → Execute tool → Send result → Claude response → ...
```

This continues until Claude responds without tool calls (max 20 iterations).

### 5. History Tracking
Every tool execution is recorded as a command in the history store, enabling:
- Selective undo (undo any operation, not just the most recent)
- Operation labels for display
- Execute/undo function pairs

## UI Components

### ConversationPanel
The main chat interface showing:
- Chronological history (newest at top)
- User messages
- Assistant responses with streaming text
- Action items (tool executions) with "click to undo" functionality
- Suggestion chips for common operations

### Suggestion Chips
Pre-built commands for common edits:
- "Remove ums and ahs"
- "Remove repeated words"
- "Tighten pacing"
- "Remove retakes"

## Configuration

### Environment Variables
```bash
VITE_ANTHROPIC_API_KEY=sk-ant-...  # Required for API calls
```

### Constants (in agenticEdit.ts)
```typescript
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const MAX_TOOL_ITERATIONS = 20;
```

## API Usage

### Basic Usage
```typescript
import { executeAgenticEdit } from "../api/agenticEdit";

const result = await executeAgenticEdit("Remove all filler words", {
  onTextDelta: (text) => console.log("Streaming:", text),
  onToolStart: (name, input) => console.log("Tool starting:", name),
  onToolComplete: (name, result, commandId) => console.log("Tool done:", name),
  onComplete: (message, commandIds) => console.log("Done:", message),
  onError: (error) => console.error("Error:", error),
});
```

### Callbacks
```typescript
interface AgenticEditCallbacks {
  onTextDelta?: (text: string) => void;           // Streaming text chunks
  onToolStart?: (toolName: string, input: Record<string, unknown>) => void;
  onToolComplete?: (toolName: string, result: string, commandId?: string) => void;
  onComplete?: (message: string, commandIds: string[]) => void;
  onError?: (error: Error) => void;
}
```

### Result
```typescript
interface AgenticEditResult {
  success: boolean;
  message: string;        // Final message from Claude
  toolCallCount: number;  // Number of tool executions
  commandIds: string[];   // IDs for undo operations
}
```

## Undo System

### How It Works
Each tool execution creates a command with:
- `id`: Unique identifier
- `label`: Human-readable description (e.g., "Deleted words: um, uh, like")
- `timestamp`: When executed
- `execute`: Function to re-apply the change
- `undo`: Function to reverse the change

### API
```typescript
import { undoCommand, undoLast, clearHistory, getCommands } from "../stores/useAgenticStore";

// Undo a specific command by ID
undoCommand("cmd-abc123");

// Undo the most recent command
undoLast();

// Clear all history
clearHistory();

// Get all commands
const commands = getCommands();
```

## Debug Tools

### DebugEditPanel
Located at [DebugEditPanel.tsx](../src/components/edit/DebugEditPanel.tsx), this component allows:
- Manual testing of store actions
- Viewing word-level details with excluded state
- Viewing agent context and sentence lists

### ClaudeTest
Located at [ClaudeTest.tsx](../src/components/test/ClaudeTest.tsx), this component allows:
- Browser-based Claude API testing
- Editable system prompts
- Model selection

## Design Decisions

1. **Streaming**: Real-time text updates via SSE for responsive UX
2. **Auto-execution**: Tools execute automatically (no approval step) for speed
3. **Selective undo**: Any operation can be undone individually, not just sequentially
4. **Context-rich**: Claude receives full word-level detail with visual descriptions
5. **Iteration limit**: Max 20 tool calls prevents runaway loops
6. **Browser-based**: Direct API calls from browser (requires `anthropic-dangerous-direct-browser-access` header)
