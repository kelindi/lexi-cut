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

// --- Full Project Data Types ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceDescription {
    pub start: f64,
    pub end: f64,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Source {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cid: Option<String>,
    pub name: String,
    pub thumbnail: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub descriptions: Option<Vec<SourceDescription>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Word {
    pub id: String,
    pub word: String,
    pub start: f64,
    pub end: f64,
    pub confidence: f64,
    #[serde(rename = "sourceId")]
    pub source_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sentence {
    #[serde(rename = "sentenceId")]
    pub sentence_id: String,
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "wordIds")]
    pub word_ids: Vec<String>,
    pub text: String,
    #[serde(rename = "startTime")]
    pub start_time: f64,
    #[serde(rename = "endTime")]
    pub end_time: f64,
    #[serde(rename = "originalGroupId", skip_serializing_if = "Option::is_none")]
    pub original_group_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegmentGroup {
    #[serde(rename = "groupId")]
    pub group_id: String,
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "segmentIds")]
    pub segment_ids: Vec<String>,
    pub text: String,
    #[serde(rename = "startTime")]
    pub start_time: f64,
    #[serde(rename = "endTime")]
    pub end_time: f64,
    #[serde(rename = "avgConfidence")]
    pub avg_confidence: f64,
}

// --- Timeline Types ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoOverride {
    #[serde(rename = "sourceId")]
    pub source_id: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineEntry {
    #[serde(rename = "sentenceId")]
    pub sentence_id: String,
    pub text: String,
    #[serde(rename = "sourceId")]
    pub source_id: String,
    pub excluded: bool,
    #[serde(rename = "excludedWordIds")]
    pub excluded_word_ids: Vec<String>,
    #[serde(rename = "videoOverride", skip_serializing_if = "Option::is_none")]
    pub video_override: Option<VideoOverride>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Timeline {
    pub version: u32,
    pub entries: Vec<TimelineEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectData {
    pub id: String,
    pub name: String,
    pub sources: Vec<Source>,
    pub words: Vec<Word>,
    pub sentences: Vec<Sentence>,
    #[serde(rename = "segmentGroups")]
    pub segment_groups: Vec<SegmentGroup>,
    // New timeline structure
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeline: Option<Timeline>,
    // Deprecated (kept for migration, removed on save)
    #[serde(rename = "orderedSentenceIds", skip_serializing_if = "Option::is_none")]
    pub ordered_sentence_ids: Option<Vec<String>>,
    #[serde(rename = "excludedSentenceIds", skip_serializing_if = "Option::is_none")]
    pub excluded_sentence_ids: Option<Vec<String>>,
    #[serde(rename = "excludedWordIds", skip_serializing_if = "Option::is_none")]
    pub excluded_word_ids: Option<Vec<String>>,
    #[serde(rename = "transcriptlessSourceIds")]
    pub transcriptless_source_ids: Vec<String>,
    #[serde(rename = "savedAt")]
    pub saved_at: u64,
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

fn project_dir(app: &AppHandle, project_id: &str) -> Result<std::path::PathBuf, String> {
    let base = lexi_cut_dir(app)?;
    let dir = base.join("projects").join(project_id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create project dir: {}", e))?;
    Ok(dir)
}

#[tauri::command]
pub fn save_project_data(app: AppHandle, data: ProjectData) -> Result<(), String> {
    let dir = project_dir(&app, &data.id)?;
    let path = dir.join("project.json");
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize project data: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write project data: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn load_project_data(app: AppHandle, project_id: String) -> Result<Option<ProjectData>, String> {
    let base = lexi_cut_dir(&app)?;
    let path = base.join("projects").join(&project_id).join("project.json");
    if !path.exists() {
        return Ok(None);
    }
    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read project data: {}", e))?;
    let data: ProjectData =
        serde_json::from_str(&contents).map_err(|e| format!("Failed to parse project data: {}", e))?;
    Ok(Some(data))
}
