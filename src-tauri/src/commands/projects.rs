use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMeta {
    pub id: String,
    pub name: String,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(rename = "updatedAt", skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
}

fn lexi_cut_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|e| format!("Failed to get documents dir: {}", e))?;
    let dir = documents.join("Lexi Cut");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create Lexi Cut dir: {}", e))?;
    Ok(dir)
}

fn projects_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = lexi_cut_dir(app)?;
    Ok(dir.join("projects.json"))
}

#[tauri::command]
pub fn load_projects(app: AppHandle) -> Result<Vec<ProjectMeta>, String> {
    let path = projects_path(&app)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read projects: {}", e))?;
    let projects: Vec<ProjectMeta> =
        serde_json::from_str(&contents).map_err(|e| format!("Failed to parse projects: {}", e))?;
    Ok(projects)
}

#[tauri::command]
pub fn save_projects(app: AppHandle, projects: Vec<ProjectMeta>) -> Result<(), String> {
    let path = projects_path(&app)?;
    let json = serde_json::to_string_pretty(&projects)
        .map_err(|e| format!("Failed to serialize projects: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write projects: {}", e))?;
    Ok(())
}
