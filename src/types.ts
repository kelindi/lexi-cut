// --- Project Data Model ---

export interface Source {
  id: string;
  filePath: string;
  duration: number;
}

export interface TextLayer {
  word: string;
  confidence: number;
  sourceId: string;
  start: number;
  end: number;
}

export interface VideoLayer {
  sourceId: string;
  start: number;
  end: number;
}

export interface AudioLayer {
  sourceId: string;
  start: number;
  end: number;
  volume: number;
}

export interface Segment {
  id: string;
  description?: string;
  text?: TextLayer;
  video?: VideoLayer;
  audio?: AudioLayer;
}

export interface Project {
  id: string;
  sources: Source[];
  timeline: Segment[];
}

// --- ElevenLabs Scribe v2 API Response ---

export interface ElevenLabsWord {
  text: string;
  start: number;
  end: number;
  type: "word" | "spacing" | "audio_event";
  speaker_id?: string;
  logprob?: number;
}

export interface ElevenLabsTranscriptResponse {
  language_code: string;
  language_probability: number;
  text: string;
  words: ElevenLabsWord[];
  transcription_id: string;
}
