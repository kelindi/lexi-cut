mod commands;
mod services;

use commands::{generate_cid, generate_thumbnail};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![generate_thumbnail, generate_cid])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
