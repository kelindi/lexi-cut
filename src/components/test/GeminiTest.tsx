import { useState } from "react";
import { fetch } from "@tauri-apps/plugin-http";
import { CircleNotch, Play, Copy, Check, UploadSimple } from "@phosphor-icons/react";
import { uploadVideoFile } from "../../api/gemini";

const DEFAULT_PROMPT = `Analyze the video from {startTime}s to {endTime}s.
Provide a concise description (1-2 sentences) of what is happening in the video during this timeframe. Focus on actions, subjects, and setting that would help a video editor understand the content of this clip.`;

const GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export function GeminiTest() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string>("video/mp4");
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(5);
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleUpload() {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setUploadStatus("Uploading...");

    try {
      const { uri, mimeType } = await uploadVideoFile(file);
      setFileUri(uri);
      setFileMimeType(mimeType);
      setUploadStatus("Ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploadStatus(null);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleQuery() {
    if (!fileUri) return;

    setIsQuerying(true);
    setError(null);
    setResponse(null);

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setError("Missing VITE_GEMINI_API_KEY");
      setIsQuerying(false);
      return;
    }

    const resolvedPrompt = prompt
      .replace("{startTime}", startTime.toFixed(1))
      .replace("{endTime}", endTime.toFixed(1));

    try {
      const res = await fetch(`${GENERATE_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { fileData: { mimeType: fileMimeType, fileUri } },
                { text: resolvedPrompt },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      setResponse(text ?? JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setIsQuerying(false);
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
        <label className="flex-1">
          <input
            type="file"
            accept="video/*"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setFileUri(null);
              setUploadStatus(null);
              setError(null);
            }}
            className="block w-full text-sm text-neutral-400 file:mr-3 file:rounded file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-neutral-700"
          />
        </label>
        <button
          onClick={handleUpload}
          disabled={!file || isUploading}
          className="flex items-center gap-2 rounded bg-neutral-800 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          {isUploading ? (
            <CircleNotch size={14} className="animate-spin" />
          ) : (
            <UploadSimple size={14} />
          )}
          {isUploading ? "Uploading..." : "Upload"}
        </button>
      </div>

      {uploadStatus && (
        <p className={`text-xs ${fileUri ? "text-green-400" : "text-neutral-400"}`}>
          {uploadStatus}
          {fileUri && <span className="ml-2 text-neutral-600">{fileUri}</span>}
        </p>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">
          Prompt <span className="text-neutral-600">({"{startTime}"} and {"{endTime}"} will be replaced)</span>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="w-full resize-y rounded border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs text-neutral-300 placeholder:text-neutral-600"
          placeholder="Prompt..."
        />
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Start (s)
          <input
            type="number"
            step="0.1"
            value={startTime}
            onChange={(e) => setStartTime(Number(e.target.value))}
            className="w-20 rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          End (s)
          <input
            type="number"
            step="0.1"
            value={endTime}
            onChange={(e) => setEndTime(Number(e.target.value))}
            className="w-20 rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300"
          />
        </label>
      </div>

      <button
        onClick={handleQuery}
        disabled={!fileUri || isQuerying}
        className="flex items-center gap-2 rounded bg-white px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40"
      >
        {isQuerying ? (
          <CircleNotch size={14} className="animate-spin" />
        ) : (
          <Play size={14} weight="fill" />
        )}
        {isQuerying ? "Querying..." : "Query"}
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
          <pre className="max-h-80 overflow-auto rounded border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs text-neutral-300 whitespace-pre-wrap">
            {response}
          </pre>
        </div>
      )}
    </div>
  );
}
