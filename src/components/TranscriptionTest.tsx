import { useState } from "react";
import { transcribeFile, mapTranscriptToSegments } from "../api/transcribe";
import type { Segment, ElevenLabsTranscriptResponse } from "../types";

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
    <div style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h2>Transcription Test (Scribe v2)</h2>

      <div style={{ marginBottom: "1rem" }}>
        <input
          type="file"
          accept="audio/*,video/*"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        <button
          onClick={handleTranscribe}
          disabled={!file || isLoading}
          style={{ marginLeft: "0.5rem" }}
        >
          {isLoading ? "Transcribing..." : "Transcribe"}
        </button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {rawResponse && (
        <div style={{ marginBottom: "1rem", fontSize: "0.85rem", color: "#666" }}>
          <p>Language: {rawResponse.language_code} ({(rawResponse.language_probability * 100).toFixed(1)}%)</p>
          <p>Words: {segments.length}</p>
          <p>Transcription ID: {rawResponse.transcription_id}</p>
        </div>
      )}

      {segments.length > 0 && (
        <div>
          <h3>Full Text</h3>
          <p style={{ background: "#f5f5f5", padding: "1rem", borderRadius: "4px" }}>
            {segments.map((seg) => seg.text?.word).join(" ")}
          </p>

          <h3>Segments ({segments.length})</h3>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.8rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px" }}>Word</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "4px" }}>Start (s)</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "4px" }}>End (s)</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "4px" }}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((seg) => (
                <tr key={seg.id}>
                  <td style={{ padding: "4px" }}>{seg.text?.word}</td>
                  <td style={{ textAlign: "right", padding: "4px" }}>{seg.text?.start.toFixed(3)}</td>
                  <td style={{ textAlign: "right", padding: "4px" }}>{seg.text?.end.toFixed(3)}</td>
                  <td style={{ textAlign: "right", padding: "4px" }}>{seg.text?.confidence.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
