mod habit_sheet;
mod notes;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      habit_sheet::habit_sheet_current,
      habit_sheet::habit_sheet_pick,
      habit_sheet::habit_sheet_create,
      habit_sheet::habit_sheet_read,
      habit_sheet::habit_sheet_write,
      notes::note_recents,
      notes::note_pick,
      notes::note_create,
      notes::note_open,
      notes::note_write,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
