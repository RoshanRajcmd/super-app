#[cfg(target_os = "android")]
mod android_saf;
mod habit_sheet;
mod notes;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_dialog::init())
    // Registered for Rust's benefit only — it is what opens an Android
    // `content://` URI as a file. The frontend is granted none of its
    // permissions, so none of its commands are reachable from the webview.
    .plugin(tauri_plugin_fs::init());

  // The Storage Access Framework has no counterpart elsewhere.
  #[cfg(target_os = "android")]
  let builder = builder.plugin(android_saf::init());

  builder
    .invoke_handler(tauri::generate_handler![
      habit_sheet::habit_sheet_current,
      habit_sheet::habit_sheet_pick,
      habit_sheet::habit_sheet_create,
      habit_sheet::habit_sheet_mtime,
      habit_sheet::habit_sheet_read,
      habit_sheet::habit_sheet_write,
      habit_sheet::habit_sheet_export,
      notes::note_recents,
      notes::note_pick,
      notes::note_create,
      notes::note_default_dir,
      notes::note_pick_default_dir,
      notes::note_set_default_dir,
      notes::note_open_path,
      notes::note_clear_default_dir,
      notes::note_open,
      notes::note_write,
      notes::note_image,
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
