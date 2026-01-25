import { invoke } from "@tauri-apps/api/core";
import type { ProjectMeta } from "../types";

export async function loadProjects(): Promise<ProjectMeta[]> {
  return invoke<ProjectMeta[]>("load_projects");
}

export async function saveProjects(projects: ProjectMeta[]): Promise<void> {
  await invoke("save_projects", { projects });
}
