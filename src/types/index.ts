// --- Project Metadata (for project list) ---

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
  thumbnail?: string;
}

// --- Source (media file) ---

export interface SourceDescription {
  start: number;
  end: number;
  description: string;
}

export interface Source {
  id: string;
  cid?: string;
  name: string;
  thumbnail: string;
  path: string;
  duration?: number;
  descriptions?: SourceDescription[];
}

// --- Project Data Model ---

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

export interface SegmentGroup {
  groupId: string;
  sourceId: string;
  segmentIds: string[];
  text: string;
  startTime: number;
  endTime: number;
  avgConfidence: number;
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
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export interface GeminiGenerateContentResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
}

export interface DescriptionProgress {
  phase: "uploading" | "processing" | "describing";
  current: number;
  total: number;
}

// --- Timeline Segment for Remotion ---

export interface TimelineSegment {
  groupId: string;
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
  | "describing"
  | "assembling"
  | "ready"
  | "error";

export interface ProcessingProgress {
  current: number;
  total: number;
  message?: string;
}
