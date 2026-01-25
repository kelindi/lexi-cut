mod commands;
mod services;

use commands::{
    export_video, extract_clip_base64, extract_frames_base64, generate_cid, generate_thumbnail,
    get_cached, get_dimensions, get_duration, load_project_data, load_projects, read_file_base64,
    save_project_data, save_projects, set_cached,
};
use services::CacheDb;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // Initialize cache database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            let cache_db =
                CacheDb::init(app_data_dir).expect("Failed to initialize cache database");
            app.manage(cache_db);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            generate_thumbnail,
            generate_cid,
            get_duration,
            get_dimensions,
            export_video,
            extract_clip_base64,
            extract_frames_base64,
            read_file_base64,
            get_cached,
            set_cached,
            load_projects,
            save_projects,
            save_project_data,
            load_project_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
