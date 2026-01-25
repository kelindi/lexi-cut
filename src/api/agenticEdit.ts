/**
 * Agentic Edit API - Claude tool-use integration for video editing with streaming
 *
 * This module sends the timeline context to Claude with tool definitions,
 * then executes tool calls in a loop until Claude responds with text.
 * Supports streaming for real-time text updates.
 */

import {
  getAgentContext,
  deleteWords,
  restoreWords,
  deleteSentences,
  restoreSentences,
  reorderSentences,
} from "../stores/useAgenticStore";
import { useProjectStore } from "../stores/useProjectStore";

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

export interface AgenticEditCallbacks {
  onTextDelta?: (text: string) => void;
  onToolStart?: (toolName: string, input: Record<string, unknown>) => void;
  onToolComplete?: (toolName: string, result: string, commandId?: string) => void;
  onComplete?: (message: string, commandIds: string[]) => void;
  onError?: (error: Error) => void;
}

export interface AgenticEditResult {
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
 * Parse SSE stream and extract events
 */
async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<{ event: string; data: string }> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let currentEvent = "";
    let currentData = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7);
      } else if (line.startsWith("data: ")) {
        currentData = line.slice(6);
        if (currentEvent && currentData) {
          yield { event: currentEvent, data: currentData };
          currentEvent = "";
          currentData = "";
        }
      }
    }
  }
}

/**
 * Make a streaming API call and collect the response
 */
async function streamingApiCall(
  apiKey: string,
  messages: Message[],
  callbacks: AgenticEditCallbacks,
  systemPrompt: string = SYSTEM_PROMPT
): Promise<{ content: ContentBlock[]; stopReason: string }> {
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
      system: systemPrompt,
      tools: TOOLS,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  const reader = response.body.getReader();
  const contentBlocks: ContentBlock[] = [];
  let currentTextBlock: TextBlock | null = null;
  let currentToolBlock: ToolUseBlock | null = null;
  let currentToolInput = "";
  let stopReason = "";

  for await (const { event, data } of parseSSEStream(reader)) {
    if (data === "[DONE]") break;

    try {
      const parsed = JSON.parse(data);

      switch (event) {
        case "content_block_start":
          if (parsed.content_block?.type === "text") {
            currentTextBlock = { type: "text", text: "" };
          } else if (parsed.content_block?.type === "tool_use") {
            currentToolBlock = {
              type: "tool_use",
              id: parsed.content_block.id,
              name: parsed.content_block.name,
              input: {},
            };
            currentToolInput = "";
            callbacks.onToolStart?.(parsed.content_block.name, {});
          }
          break;

        case "content_block_delta":
          if (parsed.delta?.type === "text_delta" && currentTextBlock) {
            currentTextBlock.text += parsed.delta.text;
            callbacks.onTextDelta?.(parsed.delta.text);
          } else if (parsed.delta?.type === "input_json_delta" && currentToolBlock) {
            currentToolInput += parsed.delta.partial_json;
          }
          break;

        case "content_block_stop":
          if (currentTextBlock) {
            contentBlocks.push(currentTextBlock);
            currentTextBlock = null;
          } else if (currentToolBlock) {
            try {
              currentToolBlock.input = currentToolInput ? JSON.parse(currentToolInput) : {};
            } catch {
              currentToolBlock.input = {};
            }
            contentBlocks.push(currentToolBlock);
            currentToolBlock = null;
            currentToolInput = "";
          }
          break;

        case "message_delta":
          if (parsed.delta?.stop_reason) {
            stopReason = parsed.delta.stop_reason;
          }
          break;
      }
    } catch (e) {
      console.warn("[agenticEdit] Failed to parse SSE data:", data, e);
    }
  }

  return { content: contentBlocks, stopReason };
}

/**
 * Execute an agentic editing request with streaming
 *
 * Sends the user's instruction along with the current timeline context to Claude,
 * then executes any tool calls in a loop until Claude responds with a final message.
 */
export async function executeAgenticEdit(
  userInstruction: string,
  callbacks: AgenticEditCallbacks = {}
): Promise<AgenticEditResult> {
  console.log(`[agenticEdit] Starting with instruction: "${userInstruction}"`);

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    const error = new Error("Missing VITE_ANTHROPIC_API_KEY in environment variables");
    callbacks.onError?.(error);
    throw error;
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
  let finalMessage = "";

  try {
    // Agentic loop
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      console.log(`[agenticEdit] Iteration ${iteration + 1}, calling Claude...`);

      const { content, stopReason } = await streamingApiCall(apiKey, messages, callbacks);

      console.log(
        `[agenticEdit] Response stop_reason: ${stopReason}, content blocks: ${content.length}`
      );

      // Check if Claude wants to use tools
      const toolUseBlocks = content.filter(
        (block): block is ToolUseBlock => block.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls - Claude is done, extract final message
        const textBlock = content.find(
          (block): block is TextBlock => block.type === "text"
        );
        finalMessage = textBlock?.text || "Edit completed.";

        console.log(
          `[agenticEdit] Completed with ${toolCallCount} tool calls. Message: ${finalMessage.slice(0, 100)}...`
        );

        callbacks.onComplete?.(finalMessage, commandIds);

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
        callbacks.onToolComplete?.(toolUse.name, result, commandId);
        console.log(
          `[agenticEdit] Tool ${toolUse.name}: ${success ? "success" : "failed"} - ${result}`
        );
      }

      // Add assistant response and tool results to messages
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: toolResults as unknown as string });
    }

    // Hit max iterations
    console.warn(
      `[agenticEdit] Hit max iterations (${MAX_TOOL_ITERATIONS}), stopping`
    );
    finalMessage = `Completed ${toolCallCount} edits (reached iteration limit)`;
    callbacks.onComplete?.(finalMessage, commandIds);

    return {
      success: true,
      message: finalMessage,
      toolCallCount,
      commandIds,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    callbacks.onError?.(err);
    throw err;
  }
}

// Assembly cut system prompt - focused on initial timeline refinement
const ASSEMBLY_CUT_SYSTEM_PROMPT = `You are an AI video editor assistant performing an initial assembly cut. Analyze the timeline and make it production-ready.

You have access to the following tools:
- delete_words: Remove specific words from a sentence (for filler words, stutters, etc.)
- restore_words: Bring back previously deleted words
- delete_sentences: Remove entire sentences from the timeline
- restore_sentences: Bring back previously deleted sentences
- reorder_sentences: Change the order of sentences in the timeline

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

The timeline is currently in chronological order. Refine it for the best viewing experience.
Words marked with ~ prefix are already excluded/deleted.
Sentences marked as EXCLUDED are already removed from the timeline.`;

/**
 * Execute an agentic assembly cut on the timeline
 *
 * This runs after the pipeline initializes the timeline with chronological order.
 * It uses Claude to identify retakes, remove duplicates, and reorder for narrative flow.
 * Gracefully returns success if API is unavailable (timeline stays in chronological order).
 */
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

  const context = getAgentContext();

  const userMessage = `Current timeline state:

${context}

---

Please perform an assembly cut on this timeline. Identify and remove retakes/duplicates, and reorder for better narrative flow if needed.`;

  const messages: Message[] = [{ role: "user", content: userMessage }];
  const commandIds: string[] = [];
  let toolCallCount = 0;
  let finalMessage = "";

  try {
    // Agentic loop with assembly cut system prompt
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      console.log(`[agenticEdit] Assembly cut iteration ${iteration + 1}, calling Claude...`);

      const { content, stopReason } = await streamingApiCall(
        apiKey,
        messages,
        callbacks,
        ASSEMBLY_CUT_SYSTEM_PROMPT
      );

      console.log(
        `[agenticEdit] Response stop_reason: ${stopReason}, content blocks: ${content.length}`
      );

      // Check if Claude wants to use tools
      const toolUseBlocks = content.filter(
        (block): block is ToolUseBlock => block.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls - Claude is done, extract final message
        const textBlock = content.find(
          (block): block is TextBlock => block.type === "text"
        );
        finalMessage = textBlock?.text || "Assembly cut completed.";

        console.log(
          `[agenticEdit] Assembly cut completed with ${toolCallCount} tool calls. Message: ${finalMessage.slice(0, 100)}...`
        );

        callbacks.onComplete?.(finalMessage, commandIds);

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
          `[agenticEdit] Assembly cut executing tool: ${toolUse.name}`,
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
        callbacks.onToolComplete?.(toolUse.name, result, commandId);
        console.log(
          `[agenticEdit] Assembly cut tool ${toolUse.name}: ${success ? "success" : "failed"} - ${result}`
        );
      }

      // Add assistant response and tool results to messages
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: toolResults as unknown as string });
    }

    // Hit max iterations
    console.warn(
      `[agenticEdit] Assembly cut hit max iterations (${MAX_TOOL_ITERATIONS}), stopping`
    );
    finalMessage = `Assembly cut completed ${toolCallCount} edits (reached iteration limit)`;
    callbacks.onComplete?.(finalMessage, commandIds);

    return {
      success: true,
      message: finalMessage,
      toolCallCount,
      commandIds,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    callbacks.onError?.(err);
    throw err;
  }
}
