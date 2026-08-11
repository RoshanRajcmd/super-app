//! Native file access for the habit tracker spreadsheet.
//!
//! The webview never supplies a filesystem path. The user picks the `.xlsx`
//! once through the OS dialog; that choice is persisted here, in the app-data
//! directory, and every later read/write resolves it from disk. So a compromised
//! or buggy frontend cannot redirect file I/O at an arbitrary file.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const POINTER_FILE: &str = "habit-sheet-path.txt";

/// A spreadsheet's bytes plus the modification time they were read at.
///
/// The frontend echoes `mtime` back when saving; a mismatch means something
/// else (usually Google Drive syncing another device's copy) rewrote the file
/// in the meantime, so the write is refused rather than clobbering it.
#[derive(Serialize)]
pub struct SheetPayload {
    pub path: String,
    /// Base64-encoded `.xlsx` bytes. `None` when the file does not exist yet.
    pub data: Option<String>,
    /// Milliseconds since the Unix epoch, or `None` if the file does not exist.
    pub mtime: Option<u64>,
}

fn pointer_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create app data dir: {e}"))?;
    Ok(dir.join(POINTER_FILE))
}

fn read_pointer(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let pointer = pointer_path(app)?;
    match fs::read_to_string(&pointer) {
        Ok(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(PathBuf::from(trimmed)))
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("cannot read saved sheet path: {e}")),
    }
}

fn write_pointer(app: &AppHandle, path: &Path) -> Result<(), String> {
    let pointer = pointer_path(app)?;
    fs::write(&pointer, path.to_string_lossy().as_bytes())
        .map_err(|e| format!("cannot save sheet path: {e}"))
}

fn mtime_ms(path: &Path) -> Result<Option<u64>, String> {
    match fs::metadata(path) {
        Ok(meta) => {
            let modified = meta
                .modified()
                .map_err(|e| format!("cannot read mtime: {e}"))?;
            let ms = modified
                .duration_since(UNIX_EPOCH)
                .map_err(|e| format!("mtime before epoch: {e}"))?
                .as_millis() as u64;
            Ok(Some(ms))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("cannot stat sheet: {e}")),
    }
}

fn load(path: PathBuf) -> Result<SheetPayload, String> {
    let mtime = mtime_ms(&path)?;
    let data = match fs::read(&path) {
        Ok(bytes) => Some(BASE64.encode(bytes)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("cannot read sheet: {e}")),
    };
    Ok(SheetPayload {
        path: path.to_string_lossy().into_owned(),
        data,
        mtime,
    })
}

/// The sheet the user chose previously, or `None` on first run.
#[tauri::command]
pub fn habit_sheet_current(app: AppHandle) -> Result<Option<SheetPayload>, String> {
    match read_pointer(&app)? {
        Some(path) => load(path).map(Some),
        None => Ok(None),
    }
}

/// Open an existing `.xlsx` via the OS picker and remember it.
///
/// Returns `None` if the user cancels.
#[tauri::command]
pub async fn habit_sheet_pick(app: AppHandle) -> Result<Option<SheetPayload>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Excel spreadsheet", &["xlsx"])
        .blocking_pick_file();

    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|e| format!("unsupported file location: {e}"))?;

    write_pointer(&app, &path)?;
    load(path).map(Some)
}

/// Choose where to create a new sheet and remember it.
///
/// The file itself is not created here; the frontend follows up with a save
/// once it has built the workbook. Returns `None` if the user cancels.
#[tauri::command]
pub async fn habit_sheet_create(app: AppHandle, suggested_name: String) -> Result<Option<SheetPayload>, String> {
    // The dialog supplies the name, but strip any path separators the frontend
    // may have sent so the suggestion cannot walk out of the chosen directory.
    let safe_name = Path::new(&suggested_name)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "habits.xlsx".to_string());

    let picked = app
        .dialog()
        .file()
        .add_filter("Excel spreadsheet", &["xlsx"])
        .set_file_name(&safe_name)
        .blocking_save_file();

    let Some(picked) = picked else {
        return Ok(None);
    };
    let mut path = picked
        .into_path()
        .map_err(|e| format!("unsupported file location: {e}"))?;
    if path.extension().is_none() {
        path.set_extension("xlsx");
    }

    write_pointer(&app, &path)?;
    load(path).map(Some)
}

/// Re-read the remembered sheet from disk.
#[tauri::command]
pub fn habit_sheet_read(app: AppHandle) -> Result<SheetPayload, String> {
    let path = read_pointer(&app)?.ok_or("no habit sheet selected yet")?;
    load(path)
}

/// Write base64 `.xlsx` bytes to the remembered sheet.
///
/// `expected_mtime` guards against overwriting a copy that changed underneath
/// us; pass `None` only when the file is not expected to exist yet. The new
/// mtime is returned so the frontend can track the file it just wrote.
#[tauri::command]
pub fn habit_sheet_write(
    app: AppHandle,
    data: String,
    expected_mtime: Option<u64>,
) -> Result<u64, String> {
    let path = read_pointer(&app)?.ok_or("no habit sheet selected yet")?;
    let bytes = BASE64
        .decode(data.as_bytes())
        .map_err(|e| format!("malformed sheet payload: {e}"))?;

    let on_disk = mtime_ms(&path)?;
    if on_disk != expected_mtime {
        return Err("CONFLICT".to_string());
    }

    // Write to a sibling temp file and rename, so an interrupted write cannot
    // leave a half-written spreadsheet behind.
    let temp = path.with_extension("xlsx.tmp");
    fs::write(&temp, &bytes).map_err(|e| format!("cannot write sheet: {e}"))?;
    fs::rename(&temp, &path).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("cannot replace sheet: {e}")
    })?;

    mtime_ms(&path)?.ok_or_else(|| "sheet vanished after write".to_string())
}
