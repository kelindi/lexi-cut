mod commands;
mod services;

use commands::{export_video, generate_cid, generate_thumbnail, read_file_base64};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            generate_thumbnail,
            generate_cid,
            export_video,
            read_file_base64
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
