/**
 * Agentic Edit API - Claude tool-use integration for video editing
 *
 * This module sends the timeline context to Claude with tool definitions,
 * then executes tool calls in a loop until Claude responds with text.
 */

import { fetch } from "@tauri-apps/plugin-http";
import {
  getAgentContext,
  deleteWords,
  restoreWords,
  deleteSentences,
  restoreSentences,
  reorderSentences,
} from "../stores/useAgenticStore";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const MAX_TOOL_ITERATIONS = 20;

// Tool definitions for Claude
const TOOLS = [
  {
    name: "delete_words",
    description:
      "Delete specific words from a sentence by their IDs. Use this to remove filler words (um, uh, like), stutters, or unwanted words. The words will be excluded from the final video.",
    input_schema: {
      type: "object",
      properties: {
        sentence_id: {
          type: "string",
          description: "The ID of the sentence containing the words to delete",
        },
        word_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of word IDs to delete from the sentence",
        },
      },
      required: ["sentence_id", "word_ids"],
    },
  },
  {
    name: "restore_words",
    description:
      "Restore previously deleted words in a sentence. Use this to undo word deletions or bring back words that were incorrectly removed.",
    input_schema: {
      type: "object",
      properties: {
        sentence_id: {
          type: "string",
          description: "The ID of the sentence containing the words to restore",
        },
        word_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of word IDs to restore in the sentence",
        },
      },
      required: ["sentence_id", "word_ids"],
    },
  },
  {
    name: "delete_sentences",
    description:
      "Delete entire sentences from the timeline. Use this to remove sections that are duplicates, off-topic, or unwanted. Deleted sentences can be restored later.",
    input_schema: {
      type: "object",
      properties: {
        sentence_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of sentence IDs to delete from the timeline",
        },
      },
      required: ["sentence_ids"],
    },
  },
  {
    name: "restore_sentences",
    description:
      "Restore previously deleted sentences to the timeline. Use this to undo sentence deletions.",
    input_schema: {
      type: "object",
      properties: {
        sentence_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of sentence IDs to restore to the timeline",
        },
      },
      required: ["sentence_ids"],
    },
  },
  {
    name: "reorder_sentences",
    description:
      "Reorder sentences in the timeline by providing a new order of sentence IDs. Use this to rearrange the narrative flow or fix the sequence of content.",
    input_schema: {
      type: "object",
      properties: {
        sentence_ids: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of sentence IDs in the desired new order. Must include all active (non-excluded) sentence IDs.",
        },
      },
      required: ["sentence_ids"],
    },
  },
];

const SYSTEM_PROMPT = `You are an AI video editor assistant. You help users edit their video timeline by removing unwanted content, fixing pacing, and improving flow.

You have access to the following tools:
- delete_words: Remove specific words from a sentence (for filler words, stutters, etc.)
- restore_words: Bring back previously deleted words
- delete_sentences: Remove entire sentences from the timeline
- restore_sentences: Bring back previously deleted sentences
- reorder_sentences: Change the order of sentences in the timeline

Guidelines:
1. When asked to remove filler words (um, uh, ah, like, you know), find them in the word list and delete them.
2. When asked to remove repeated words or stutters, identify consecutive duplicates and remove the extras.
3. When asked to tighten pacing, look for unnecessary words or sentences that can be removed.
4. Look for retakes - sentences that are duplicated or very similar in content within a short time span are often retakes where the speaker tried again. Keep the best take (usually the later, more complete version) and delete the others.
5. Consider creative flow - you can reorder sentences to create a better narrative arc or logical progression. Use reorder_sentences to shift content around for better storytelling.
6. Work systematically through the content, making multiple tool calls as needed.
7. After making changes, provide a brief summary of what you did.

The user will provide context about the current timeline state, including sentence IDs, word IDs, and their text content.
Words marked with ~ prefix are already excluded/deleted.
Sentences marked as EXCLUDED are already removed from the timeline.`;

// Type definitions
interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface TextBlock {
  type: "text";
  text: string;
}

type ContentBlock = ToolUseBlock | TextBlock;

interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

interface AgenticEditResult {
  success: boolean;
  message: string;
  toolCallCount: number;
  commandIds: string[];
}

/**
 * Execute a tool call and return the result
 */
function executeTool(
  name: string,
  input: Record<string, unknown>
): { success: boolean; result: string; commandId?: string } {
  try {
    switch (name) {
      case "delete_words": {
        const sentenceId = input.sentence_id as string;
        const wordIds = input.word_ids as string[];
        const commandId = deleteWords(sentenceId, wordIds);
        return {
          success: true,
          result: `Deleted ${wordIds.length} word(s) from sentence ${sentenceId}`,
          commandId,
        };
      }
      case "restore_words": {
        const sentenceId = input.sentence_id as string;
        const wordIds = input.word_ids as string[];
        const commandId = restoreWords(sentenceId, wordIds);
        return {
          success: true,
          result: `Restored ${wordIds.length} word(s) in sentence ${sentenceId}`,
          commandId,
        };
      }
      case "delete_sentences": {
        const sentenceIds = input.sentence_ids as string[];
        const commandId = deleteSentences(sentenceIds);
        return {
          success: true,
          result: `Deleted ${sentenceIds.length} sentence(s)`,
          commandId,
        };
      }
      case "restore_sentences": {
        const sentenceIds = input.sentence_ids as string[];
        const commandId = restoreSentences(sentenceIds);
        return {
          success: true,
          result: `Restored ${sentenceIds.length} sentence(s)`,
          commandId,
        };
      }
      case "reorder_sentences": {
        const sentenceIds = input.sentence_ids as string[];
        const commandId = reorderSentences(sentenceIds);
        return {
          success: true,
          result: `Reordered ${sentenceIds.length} sentence(s)`,
          commandId,
        };
      }
      default:
        return { success: false, result: `Unknown tool: ${name}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, result: `Error: ${message}` };
  }
}

/**
 * Execute an agentic editing request
 *
 * Sends the user's instruction along with the current timeline context to Claude,
 * then executes any tool calls in a loop until Claude responds with a final message.
 */
export async function executeAgenticEdit(
  userInstruction: string
): Promise<AgenticEditResult> {
  console.log(`[agenticEdit] Starting with instruction: "${userInstruction}"`);

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VITE_ANTHROPIC_API_KEY in environment variables");
  }

  // Build the initial user message with context
  const context = getAgentContext();
  const userMessage = `Current timeline state:

${context}

---

User request: ${userInstruction}`;

  const messages: Message[] = [{ role: "user", content: userMessage }];
  const commandIds: string[] = [];
  let toolCallCount = 0;

  // Agentic loop
  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    console.log(`[agenticEdit] Iteration ${iteration + 1}, calling Claude...`);

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[agenticEdit] Claude API FAILED (${response.status}): ${errorText}`
      );
      throw new Error(`Agentic edit failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      content: ContentBlock[];
      stop_reason: string;
    };

    console.log(
      `[agenticEdit] Response stop_reason: ${data.stop_reason}, content blocks: ${data.content.length}`
    );

    // Check if Claude wants to use tools
    const toolUseBlocks = data.content.filter(
      (block): block is ToolUseBlock => block.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      // No tool calls - Claude is done, extract final message
      const textBlock = data.content.find(
        (block): block is TextBlock => block.type === "text"
      );
      const finalMessage = textBlock?.text || "Edit completed.";

      console.log(
        `[agenticEdit] Completed with ${toolCallCount} tool calls. Message: ${finalMessage.slice(0, 100)}...`
      );

      return {
        success: true,
        message: finalMessage,
        toolCallCount,
        commandIds,
      };
    }

    // Execute tool calls and build results
    const toolResults: ToolResult[] = [];

    for (const toolUse of toolUseBlocks) {
      console.log(
        `[agenticEdit] Executing tool: ${toolUse.name}`,
        toolUse.input
      );

      const { success, result, commandId } = executeTool(
        toolUse.name,
        toolUse.input
      );

      if (commandId) {
        commandIds.push(commandId);
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });

      toolCallCount++;
      console.log(
        `[agenticEdit] Tool ${toolUse.name}: ${success ? "success" : "failed"} - ${result}`
      );
    }

    // Add assistant response and tool results to messages
    messages.push({ role: "assistant", content: data.content });
    messages.push({ role: "user", content: toolResults as unknown as string });
  }

  // Hit max iterations
  console.warn(
    `[agenticEdit] Hit max iterations (${MAX_TOOL_ITERATIONS}), stopping`
  );
  return {
    success: true,
    message: `Completed ${toolCallCount} edits (reached iteration limit)`,
    toolCallCount,
    commandIds,
  };
}
