// --- Source (media file) ---

export interface Source {
  id: string;
  cid?: string;
  name: string;
  thumbnail: string;
  path: string;
  duration?: number;
}

// --- Project Data Model ---

// Single transcribed word with timing
export interface Word {
  id: string;
  word: string;
  start: number;
  end: number;
  confidence: number;
  sourceId: string;
}

export interface Project {
  id: string;
  sources: Source[];
  timeline: Word[];
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

// --- Assembly Cut (Claude API) Types ---

export interface SegmentGroup {
  groupId: string;
  sourceId: string;
  segmentIds: string[];
  text: string;
  startTime: number;
  endTime: number;
  avgConfidence: number;
}

// --- Sentence (first-class reorderable unit) ---

export interface Sentence {
  sentenceId: string;
  sourceId: string;
  wordIds: string[];         // Words in this sentence
  text: string;
  startTime: number;
  endTime: number;
  originalGroupId?: string;  // For optional visual grouping
}

export interface DuplicateGroup {
  phrase: string;
  groupIds: string[];
  recommendedGroupId: string;
  reason: string;
}

export interface AssemblyCutResult {
  orderedSegmentIds: string[];
  duplicates: DuplicateGroup[];
  narrativeSummary: string;
}

export interface AssemblyCutRequest {
  segmentGroups: SegmentGroup[];
  sourceNames: Record<string, string>;
}

// --- Gemini Video Understanding API Types ---

export interface GeminiFileUploadResponse {
  file: {
    name: string;
    uri: string;
    state: "PROCESSING" | "ACTIVE" | "FAILED";
  };
}

export interface GeminiFileStatusResponse {
  name: string;
  uri: string;
  state: "PROCESSING" | "ACTIVE" | "FAILED";
}

export interface GeminiGenerateContentResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
}

export interface DescriptionProgress {
  phase: "uploading" | "processing" | "querying";
  current: number;
  total: number;
}

// --- Segment (continuous video chunk from same source) ---

export interface Segment {
  id: string;
  sentenceIds: string[]; // One or more sentences merged into this segment
  sourceId: string;
  sourcePath: string;
  sourceStart: number; // seconds into source video
  sourceEnd: number; // seconds into source video
  startFrame: number; // frame position in timeline
  durationFrames: number;
  text: string;
}

// --- Processing State ---

export type ProcessingPhase =
  | "idle"
  | "transcribing"
  | "grouping"
  | "assembling"
  | "ready"
  | "error";

export interface ProcessingProgress {
  current: number;
  total: number;
  message?: string;
}
