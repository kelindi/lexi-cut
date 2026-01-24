import { useState } from "react";
import { CircleNotch, Play } from "@phosphor-icons/react";
import { transcribeFile, mapTranscriptToSegments } from "../../api/transcribe";
import type { Segment, ElevenLabsTranscriptResponse } from "../../types";

export function TranscriptionTest() {
  const [file, setFile] = useState<File | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<ElevenLabsTranscriptResponse | null>(null);

  async function handleTranscribe() {
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setSegments([]);
    setRawResponse(null);

    try {
      const response = await transcribeFile(file);
      setRawResponse(response);
      const sourceId = file.name;
      const mapped = mapTranscriptToSegments(response, sourceId);
      setSegments(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="flex-1">
          <input
            type="file"
            accept="audio/*,video/*"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
            className="block w-full text-sm text-neutral-400 file:mr-3 file:rounded file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-neutral-700"
          />
        </label>
        <button
          onClick={handleTranscribe}
          disabled={!file || isLoading}
          className="flex items-center gap-2 rounded bg-white px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40"
        >
          {isLoading ? (
            <CircleNotch size={14} className="animate-spin" />
          ) : (
            <Play size={14} weight="fill" />
          )}
          {isLoading ? "Transcribing..." : "Transcribe"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {rawResponse && (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-400">
          <p>Language: {rawResponse.language_code} ({(rawResponse.language_probability * 100).toFixed(1)}%)</p>
          <p>Words: {segments.length}</p>
          <p>ID: {rawResponse.transcription_id}</p>
        </div>
      )}

      {segments.length > 0 && (
        <div className="space-y-3">
          <div>
            <h4 className="mb-1 text-xs font-medium text-neutral-500">Full Text</h4>
            <p className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-300">
              {segments.map((seg) => seg.text?.word).join(" ")}
            </p>
          </div>

          <div>
            <h4 className="mb-1 text-xs font-medium text-neutral-500">
              Segments ({segments.length})
            </h4>
            <div className="max-h-64 overflow-auto rounded border border-neutral-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-900">
                  <tr className="border-b border-neutral-800 text-neutral-500">
                    <th className="px-2 py-1.5 text-left font-medium">Word</th>
                    <th className="px-2 py-1.5 text-right font-medium">Start</th>
                    <th className="px-2 py-1.5 text-right font-medium">End</th>
                    <th className="px-2 py-1.5 text-right font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((seg) => (
                    <tr key={seg.id} className="border-b border-neutral-800/50 text-neutral-300">
                      <td className="px-2 py-1">{seg.text?.word}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{seg.text?.start.toFixed(3)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{seg.text?.end.toFixed(3)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{seg.text?.confidence.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
