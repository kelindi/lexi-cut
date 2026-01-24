use crate::services::CacheDb;
use tauri::State;

#[tauri::command]
pub fn get_cached(
    cid: String,
    data_type: String,
    cache_db: State<'_, CacheDb>,
) -> Result<Option<String>, String> {
    cache_db.get_cached(&cid, &data_type)
}

#[tauri::command]
pub fn set_cached(
    cid: String,
    data_type: String,
    data: String,
    cache_db: State<'_, CacheDb>,
) -> Result<(), String> {
    cache_db.set_cached(&cid, &data_type, &data)
}
