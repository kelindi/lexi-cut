mod commands;
mod services;

use commands::{
    export_video, generate_cid, generate_thumbnail, get_cached, get_video_url, read_file_base64,
    set_cached, VideoServerPort,
};
use services::{start_video_server, CacheDb, VideoServerState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize cache database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            let cache_db = CacheDb::init(app_data_dir).expect("Failed to initialize cache database");
            app.manage(cache_db);

            // Initialize video server state
            let video_state = VideoServerState::new();
            app.manage(video_state.clone());

            // Start the video server
            let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
            let port = rt.block_on(start_video_server(video_state));
            app.manage(VideoServerPort(port));

            // Keep the runtime alive
            std::mem::forget(rt);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            generate_thumbnail,
            generate_cid,
            export_video,
            read_file_base64,
            get_cached,
            set_cached,
            get_video_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
