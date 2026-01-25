import { invoke } from "@tauri-apps/api/core";
import type { ProjectMeta, Source, Word, Sentence, SegmentGroup } from "../types";

export async function loadProjects(): Promise<ProjectMeta[]> {
  return invoke<ProjectMeta[]>("load_projects");
}

export async function saveProjects(projects: ProjectMeta[]): Promise<void> {
  await invoke("save_projects", { projects });
}

// --- Full Project Data ---

export interface ProjectData {
  id: string;
  name: string;
  sources: Source[];
  words: Word[];
  sentences: Sentence[];
  segmentGroups: SegmentGroup[];
  orderedSentenceIds: string[];
  excludedSentenceIds: string[];
  excludedWordIds: string[];
  transcriptlessSourceIds: string[];
  savedAt: number;
}

export async function saveProjectData(data: ProjectData): Promise<void> {
  await invoke("save_project_data", { data });
}

export async function loadProjectData(projectId: string): Promise<ProjectData | null> {
  return invoke<ProjectData | null>("load_project_data", { projectId });
}
