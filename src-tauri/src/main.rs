#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content)
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
