import { fetch } from "@tauri-apps/plugin-http";
import type {
  Segment,
  SegmentGroup,
  AssemblyCutRequest,
  AssemblyCutResult,
} from "../types";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;

const SENTENCE_ENDINGS = /[.!?]$/;

const SYSTEM_PROMPT = `You are an AI video editor assistant. You analyze transcribed speech segments from video/audio recordings and produce an intelligent assembly cut.

Your tasks:
1. Determine the intended narrative order of the content (chronological or logical flow).
2. Identify duplicate phrases or retakes where the speaker said the same thing multiple times.
3. For each set of duplicates, recommend the best take based on completeness, confidence scores, and natural phrasing.
4. Return a reordered timeline that represents the best possible assembly cut.

Rules:
- Preserve all unique content. Only remove true duplicates/retakes.
- When picking the best take, prefer higher average confidence and more complete phrasing.
- If segments come from multiple source files, note which sources contain which content.
- Respond ONLY with valid JSON matching the schema below. No markdown, no explanation outside the JSON.

Response JSON schema:
{
  "orderedSegmentIds": string[],
  "duplicates": [
    {
      "phrase": string,
      "groupIds": string[],
      "recommendedGroupId": string,
      "reason": string
    }
  ],
  "narrativeSummary": string
}`;

export function groupSegments(
  segments: Segment[],
  maxWordsPerGroup: number = 8
): SegmentGroup[] {
  const groups: SegmentGroup[] = [];
  let currentGroup: Segment[] = [];
  let currentSourceId: string | null = null;

  function flushGroup() {
    if (currentGroup.length === 0) return;

    const sourceId = currentSourceId!;
    const segmentIds = currentGroup.map((s) => s.id);
    const texts = currentGroup.map((s) => s.text!.word);
    const confidences = currentGroup.map((s) => s.text!.confidence);
    const starts = currentGroup.map((s) => s.text!.start);
    const ends = currentGroup.map((s) => s.text!.end);

    groups.push({
      groupId: `group-${groups.length}`,
      sourceId,
      segmentIds,
      text: texts.join(" "),
      startTime: Math.min(...starts),
      endTime: Math.max(...ends),
      avgConfidence:
        confidences.reduce((sum, c) => sum + c, 0) / confidences.length,
    });

    currentGroup = [];
  }

  for (const segment of segments) {
    if (!segment.text) continue;

    const segSourceId = segment.text.sourceId;

    // Flush if source changes
    if (currentSourceId !== null && segSourceId !== currentSourceId) {
      flushGroup();
    }

    currentSourceId = segSourceId;
    currentGroup.push(segment);

    // Flush if we hit a sentence boundary or max group size
    const word = segment.text.word;
    if (
      SENTENCE_ENDINGS.test(word) ||
      currentGroup.length >= maxWordsPerGroup
    ) {
      flushGroup();
    }
  }

  flushGroup();
  return groups;
}

function buildPrompt(request: AssemblyCutRequest): {
  system: string;
  user: string;
} {
  const sourceCount = Object.keys(request.sourceNames).length;

  const sourceList = Object.entries(request.sourceNames)
    .map(([id, name]) => `- ${id}: ${name}`)
    .join("\n");

  const groupsForPrompt = request.segmentGroups.map((g) => ({
    groupId: g.groupId,
    sourceId: g.sourceId,
    text: g.text,
    startTime: g.startTime,
    endTime: g.endTime,
    avgConfidence: g.avgConfidence,
  }));

  const user = `Here are the transcribed segment groups from ${sourceCount} source file(s):

Source files:
${sourceList}

Segment groups:
${JSON.stringify(groupsForPrompt, null, 2)}

Please analyze these segments and return the assembly cut as JSON.`;

  return { system: SYSTEM_PROMPT, user };
}

function parseAssemblyCutResponse(responseText: string): AssemblyCutResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Failed to parse assembly cut response as JSON: ${responseText.slice(0, 200)}`
    );
  }

  const result = parsed as Record<string, unknown>;

  if (
    !Array.isArray(result.orderedSegmentIds) ||
    result.orderedSegmentIds.length === 0
  ) {
    throw new Error(
      "Assembly cut response missing or empty orderedSegmentIds"
    );
  }

  if (!Array.isArray(result.duplicates)) {
    throw new Error("Assembly cut response missing duplicates array");
  }

  if (typeof result.narrativeSummary !== "string") {
    throw new Error("Assembly cut response missing narrativeSummary");
  }

  return {
    orderedSegmentIds: result.orderedSegmentIds as string[],
    duplicates: result.duplicates as AssemblyCutResult["duplicates"],
    narrativeSummary: result.narrativeSummary,
  };
}

export async function requestAssemblyCut(
  request: AssemblyCutRequest
): Promise<AssemblyCutResult> {
  console.log(`[assemblyCut] requestAssemblyCut: ${request.segmentGroups.length} groups, ${Object.keys(request.sourceNames).length} sources`);
  console.log(`[assemblyCut] Sources: ${Object.keys(request.sourceNames).length}`);

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VITE_ANTHROPIC_API_KEY in environment variables");
  }

  const { system, user } = buildPrompt(request);
  console.log(`[assemblyCut] Calling Claude (${MODEL}), prompt length: ${user.length} chars`);

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[assemblyCut] Claude API FAILED (${response.status}): ${errorText}`);
    throw new Error(
      `Assembly cut request failed (${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock) {
    console.error(`[assemblyCut] No text block in response. Full response:`, JSON.stringify(data, null, 2));
    throw new Error("Assembly cut response contained no text content");
  }

  console.log(`[assemblyCut] Claude response length: ${textBlock.text.length} chars`);
  console.log(`[assemblyCut] Response preview: ${textBlock.text.substring(0, 150)}...`);

  const result = parseAssemblyCutResponse(textBlock.text);
  console.log(`[assemblyCut] Parsed: ${result.orderedSegmentIds.length} ordered IDs, ${result.duplicates.length} duplicates`);
  return result;
}