import { useState } from "react";
import { CircleNotch, Play, Copy, Check } from "@phosphor-icons/react";

const DEFAULT_SYSTEM_PROMPT = `You are an AI video editor assistant. You analyze transcribed speech segments from video/audio recordings and produce an intelligent assembly cut.

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

const DEFAULT_USER_MESSAGE = `Here are the transcribed segment groups from 1 source file(s):

Source files:
- source-1: example.mp4

Segment groups:
[]

Please analyze these segments and return the assembly cut as JSON.`;

const MODELS = [
  "claude-sonnet-4-20250514",
  "claude-haiku-35-20241022",
  "claude-opus-4-20250514",
];

export function ClaudeTest() {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [userMessage, setUserMessage] = useState(DEFAULT_USER_MESSAGE);
  const [model, setModel] = useState(MODELS[0]);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSend() {
    setIsLoading(true);
    setError(null);
    setResponse(null);

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      setError("Missing VITE_ANTHROPIC_API_KEY");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
      setResponse(textBlock?.text ?? JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopy() {
    if (!response) return;
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300"
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Max tokens
          <input
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            className="w-20 rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300"
          />
        </label>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">System Prompt</label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          className="w-full resize-y rounded border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs text-neutral-300 placeholder:text-neutral-600"
          placeholder="System prompt..."
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">User Message</label>
        <textarea
          value={userMessage}
          onChange={(e) => setUserMessage(e.target.value)}
          rows={6}
          className="w-full resize-y rounded border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs text-neutral-300 placeholder:text-neutral-600"
          placeholder="User message..."
        />
      </div>

      <button
        onClick={handleSend}
        disabled={isLoading}
        className="flex items-center gap-2 rounded bg-white px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40"
      >
        {isLoading ? (
          <CircleNotch size={14} className="animate-spin" />
        ) : (
          <Play size={14} weight="fill" />
        )}
        {isLoading ? "Sending..." : "Send"}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {response && (
        <div className="relative">
          <button
            onClick={handleCopy}
            className="absolute right-2 top-2 rounded p-1 text-neutral-500 hover:text-white"
            title="Copy response"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <pre className="max-h-80 overflow-auto rounded border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs text-neutral-300">
            {response}
          </pre>
        </div>
      )}
    </div>
  );
}
