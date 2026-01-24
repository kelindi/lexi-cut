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

// --- Assembly Cut (Claude API) Types ---

/** A group of consecutive segments forming a phrase, sent to Claude for context */
export interface SegmentGroup {
  groupId: string;
  sourceId: string;
  segmentIds: string[];
  text: string;
  startTime: number;
  endTime: number;
  avgConfidence: number;
}

/** A set of duplicate/retake phrases identified by Claude */
export interface DuplicateGroup {
  phrase: string;
  groupIds: string[];
  recommendedGroupId: string;
  reason: string;
}

/** The structured response returned by Claude */
export interface AssemblyCutResult {
  orderedSegmentIds: string[];
  duplicates: DuplicateGroup[];
  narrativeSummary: string;
}

/** Request payload for the assembly cut API call */
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

