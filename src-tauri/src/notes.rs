//! Native file access for the note editor.
//!
//! Notes are plain `.md` files the user picks or creates through the OS dialog.
//! Unlike the habit sheet there are many of them, so a single remembered path is
//! not enough: the paths the user has opened are kept here, in the app-data
//! directory, as a most-recent-first list.
//!
//! That list doubles as the allowlist. A path arriving from the webview is only
//! read or written if it is already on it, and the only way onto it is an OS
//! dialog the user drove. So a compromised or buggy frontend can still only
//! reach files the user chose by hand.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const RECENTS_FILE: &str = "note-recents.json";

/// How many notes to remember. Enough to cover "the ones I'm working on"
/// without the home page list needing to scroll far.
const MAX_RECENTS: usize = 20;

/// One remembered note, as the home page lists it.
#[derive(Serialize, Deserialize, Clone)]
pub struct NoteEntry {
    pub path: String,
    /// File name for display, so the frontend needn't parse paths.
    pub name: String,
    /// Milliseconds since the Unix epoch the file was last modified, or `None`
    /// if it could not be read.
    pub mtime: Option<u64>,
}

/// A note's contents plus the modification time they were read at.
///
/// The frontend echoes `mtime` back when saving; a mismatch means something else
/// (an editor, or Google Drive syncing another device's copy) rewrote the file
/// in the meantime, so the write is refused rather than clobbering it.
#[derive(Serialize)]
pub struct NotePayload {
    pub path: String,
    pub name: String,
    /// UTF-8 note text. `None` when the file does not exist yet.
    pub content: Option<String>,
    pub mtime: Option<u64>,
}

fn recents_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create app data dir: {e}"))?;
    Ok(dir.join(RECENTS_FILE))
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
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
        Err(e) => Err(format!("cannot stat note: {e}")),
    }
}

/// The remembered paths, oldest entries already dropped. Missing files are kept
/// out of the returned list so the home page never offers a note that is gone.
fn read_recents(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let store = recents_path(app)?;
    let raw = match fs::read_to_string(&store) {
        Ok(raw) => raw,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("cannot read recent notes: {e}")),
    };

    // A corrupt file should not brick the app; an empty list just means the
    // user re-picks their notes.
    let paths: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
    Ok(paths.into_iter().map(PathBuf::from).collect())
}

fn write_recents(app: &AppHandle, paths: &[PathBuf]) -> Result<(), String> {
    let store = recents_path(app)?;
    let display: Vec<String> = paths
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    let raw = serde_json::to_string(&display).map_err(|e| format!("cannot encode recents: {e}"))?;
    fs::write(&store, raw).map_err(|e| format!("cannot save recent notes: {e}"))
}

/// Put `path` at the front of the remembered list, de-duplicated and capped.
fn remember(app: &AppHandle, path: &Path) -> Result<(), String> {
    let mut paths = read_recents(app)?;
    paths.retain(|p| p != path);
    paths.insert(0, path.to_path_buf());
    paths.truncate(MAX_RECENTS);
    write_recents(app, &paths)
}

/// Resolve a path the frontend supplied, refusing anything the user has not
/// picked through a dialog. This is the guard that keeps note I/O from being
/// aimed at arbitrary files.
fn authorize(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let wanted = PathBuf::from(path);
    if read_recents(app)?.iter().any(|p| p == &wanted) {
        Ok(wanted)
    } else {
        Err("that note is not one you have opened".to_string())
    }
}

fn load(path: PathBuf) -> Result<NotePayload, String> {
    let mtime = mtime_ms(&path)?;
    let content = match fs::read(&path) {
        // Lossy rather than strict: a note with a stray byte should still open,
        // and the editor rewrites the whole file on save anyway.
        Ok(bytes) => Some(String::from_utf8_lossy(&bytes).into_owned()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("cannot read note: {e}")),
    };
    Ok(NotePayload {
        name: file_name(&path),
        path: path.to_string_lossy().into_owned(),
        content,
        mtime,
    })
}

/// Notes the user has opened before, most recent first. Files that have since
/// been deleted or moved are pruned.
#[tauri::command]
pub fn note_recents(app: AppHandle) -> Result<Vec<NoteEntry>, String> {
    let paths = read_recents(&app)?;
    let alive: Vec<PathBuf> = paths.into_iter().filter(|p| p.exists()).collect();

    // Persist the pruning, so a deleted note does not reappear next run.
    write_recents(&app, &alive)?;

    alive
        .into_iter()
        .map(|path| {
            Ok(NoteEntry {
                name: file_name(&path),
                mtime: mtime_ms(&path)?,
                path: path.to_string_lossy().into_owned(),
            })
        })
        .collect()
}

/// Open an existing note via the OS picker and remember it.
///
/// Returns `None` if the user cancels.
#[tauri::command]
pub async fn note_pick(app: AppHandle) -> Result<Option<NotePayload>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .blocking_pick_file();

    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|e| format!("unsupported file location: {e}"))?;

    remember(&app, &path)?;
    load(path).map(Some)
}

/// Choose where to create a new note and remember it.
///
/// The file itself is not created here; the frontend follows up with a save once
/// the user has typed something. Returns `None` if they cancel.
#[tauri::command]
pub async fn note_create(app: AppHandle, suggested_name: String) -> Result<Option<NotePayload>, String> {
    // The dialog supplies the real name, but strip any separators the frontend
    // may have sent so the suggestion cannot walk out of the chosen directory.
    let safe_name = Path::new(&suggested_name)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "note.md".to_string());

    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .set_file_name(&safe_name)
        .blocking_save_file();

    let Some(picked) = picked else {
        return Ok(None);
    };
    let mut path = picked
        .into_path()
        .map_err(|e| format!("unsupported file location: {e}"))?;
    if path.extension().is_none() {
        path.set_extension("md");
    }

    remember(&app, &path)?;
    load(path).map(Some)
}

/// Re-read a remembered note, and move it back to the front of the list.
#[tauri::command]
pub fn note_open(app: AppHandle, path: String) -> Result<NotePayload, String> {
    let path = authorize(&app, &path)?;
    remember(&app, &path)?;
    load(path)
}

/// Write note text to a remembered path.
///
/// `expected_mtime` guards against overwriting a copy that changed underneath
/// us; pass `None` only when the file is not expected to exist yet. The new
/// mtime is returned so the frontend can track the file it just wrote.
#[tauri::command]
pub fn note_write(
    app: AppHandle,
    path: String,
    content: String,
    expected_mtime: Option<u64>,
) -> Result<u64, String> {
    let path = authorize(&app, &path)?;

    let on_disk = mtime_ms(&path)?;
    if on_disk != expected_mtime {
        return Err("CONFLICT".to_string());
    }

    // Write to a sibling temp file and rename, so an interrupted write cannot
    // leave a half-written note behind.
    let temp = path.with_extension("md.tmp");
    fs::write(&temp, content.as_bytes()).map_err(|e| format!("cannot write note: {e}"))?;
    fs::rename(&temp, &path).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("cannot replace note: {e}")
    })?;

    mtime_ms(&path)?.ok_or_else(|| "note vanished after write".to_string())
}
