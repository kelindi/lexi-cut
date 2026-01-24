import { useState, useRef } from "react";
import { transcribeFile, mapTranscriptToSegments } from "./api/transcribe";
import type { Segment, ElevenLabsTranscriptResponse } from "./types";
import "./App.css";

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<ElevenLabsTranscriptResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <main className="container">
      <h1>Lexi Cut</h1>

      <div className="row">
        <input
          ref={fileInputRef}
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
        >
          {isLoading ? "Transcribing..." : "Transcribe"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {rawResponse && (
        <div className="result-meta">
          <p>Language: {rawResponse.language_code} ({(rawResponse.language_probability * 100).toFixed(1)}% confidence)</p>
          <p>Words: {segments.length}</p>
        </div>
      )}

      {segments.length > 0 && (
        <div className="transcript">
          <h2>Transcript</h2>
          <p className="transcript-text">
            {segments.map((seg) => seg.text?.word).join(" ")}
          </p>

          <h3>Word Timeline</h3>
          <div className="word-list">
            {segments.map((seg) => (
              <span key={seg.id} className="word-chip" title={`${seg.text?.start.toFixed(2)}s - ${seg.text?.end.toFixed(2)}s`}>
                {seg.text?.word}
              </span>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
