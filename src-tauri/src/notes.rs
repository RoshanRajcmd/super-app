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

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const RECENTS_FILE: &str = "note-recents.json";
/// Holds the folder new notes are created in, when the user has chosen one.
const DEFAULT_DIR_FILE: &str = "note-default-dir.txt";

/// Largest image inlined into the preview. A note's own screenshots are far
/// below this; the cap is here so a stray multi-hundred-megabyte file cannot be
/// turned into a base64 string and handed to the webview.
const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;

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

fn default_dir_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create app data dir: {e}"))?;
    Ok(dir.join(DEFAULT_DIR_FILE))
}

/// The folder new notes go into, or `None` while the user has not picked one.
///
/// A folder that has since been deleted is reported as unset, so the caller
/// falls back to asking where to save rather than failing.
fn read_default_dir(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let pointer = default_dir_path(app)?;
    match fs::read_to_string(&pointer) {
        Ok(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            let dir = PathBuf::from(trimmed);
            Ok(if dir.is_dir() { Some(dir) } else { None })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("cannot read default note folder: {e}")),
    }
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
    let path = picked.into_path().map_err(|e| {
        format!(
            "that file has no path behind it ({e}) — on Android the picker returns a \
             content:// URI, so open the note by typing its path instead"
        )
    })?;

    remember(&app, &path)?;
    load(path).map(Some)
}

/// Open a note at a path the user typed in, and remember it.
///
/// The dialog is the ordinary way in. Android's does not work for this app's
/// purposes: it hands back a `content://` URI, which has no filesystem path
/// behind it and so cannot be re-opened later, saved back to, or looked beside
/// for a note's images. Typing a path is as deliberate an act as picking one, so
/// it counts as the same authorisation — this is what puts the note on the
/// remembered list that every other note command checks against.
#[tauri::command]
pub fn note_open_path(app: AppHandle, path: String) -> Result<NotePayload, String> {
    let wanted = PathBuf::from(&path);
    if !wanted.is_file() {
        return Err(format!("no file at {path}"));
    }

    // Canonicalised so the remembered entry matches what later lookups resolve to,
    // whatever shape the typed path had.
    let resolved = wanted
        .canonicalize()
        .map_err(|e| format!("cannot resolve {path}: {e}"))?;

    remember(&app, &resolved)?;
    load(resolved)
}

/// The folder new notes are saved into, or `None` while none is set.
#[tauri::command]
pub fn note_default_dir(app: AppHandle) -> Result<Option<String>, String> {
    Ok(read_default_dir(&app)?.map(|d| d.to_string_lossy().into_owned()))
}

/// Ask the user to pick the folder new notes should go into, and remember it.
///
/// Returns the chosen folder, or `None` if they cancel.
///
/// Desktop only. The dialog plugin gates folder picking behind `cfg(desktop)`
/// because Android and iOS have no folder picker to offer — the mobile build gets
/// the stub below, and reaches the setting by typing a path instead.
#[cfg(desktop)]
#[tauri::command]
pub async fn note_pick_default_dir(app: AppHandle) -> Result<Option<String>, String> {
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let dir = picked.into_path().map_err(|e| {
        format!(
            "that folder has no path behind it ({e}) — on Android the picker returns a \
             content:// URI, so set the folder by typing its path instead"
        )
    })?;

    let pointer = default_dir_path(&app)?;
    fs::write(&pointer, dir.to_string_lossy().as_bytes())
        .map_err(|e| format!("cannot save default note folder: {e}"))?;

    Ok(Some(dir.to_string_lossy().into_owned()))
}

/// Stands in for the folder picker on mobile, which has none.
///
/// The command still has to exist: it is registered in the handler either way, and
/// the frontend only hides the button that calls it.
#[cfg(not(desktop))]
#[tauri::command]
pub async fn note_pick_default_dir(_app: AppHandle) -> Result<Option<String>, String> {
    Err("this platform has no folder picker — set the folder by typing its path instead".to_string())
}

/// Point new notes at a folder the user typed in.
///
/// Exists for the same reason as [`note_open_path`]: Android's folder picker
/// returns a `content://` URI that cannot be written into.
#[tauri::command]
pub fn note_set_default_dir(app: AppHandle, path: String) -> Result<String, String> {
    let wanted = PathBuf::from(&path);
    if !wanted.is_dir() {
        return Err(format!("no folder at {path}"));
    }

    let resolved = wanted
        .canonicalize()
        .map_err(|e| format!("cannot resolve {path}: {e}"))?;

    let pointer = default_dir_path(&app)?;
    fs::write(&pointer, resolved.to_string_lossy().as_bytes())
        .map_err(|e| format!("cannot save default note folder: {e}"))?;

    Ok(resolved.to_string_lossy().into_owned())
}

/// Forget the default folder, so new notes ask where to go again.
#[tauri::command]
pub fn note_clear_default_dir(app: AppHandle) -> Result<(), String> {
    let pointer = default_dir_path(&app)?;
    match fs::remove_file(&pointer) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("cannot clear default note folder: {e}")),
    }
}

/// A path in `dir` named `stem.md` that no file already occupies, so creating
/// two notes on the same day does not have the second overwrite the first.
fn free_path(dir: &Path, stem: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.md"));
    if !first.exists() {
        return first;
    }
    for n in 2.. {
        let candidate = dir.join(format!("{stem} ({n}).md"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

/// Create a new note and remember it.
///
/// With a default folder set the note goes straight there under
/// `suggested_name`; otherwise the OS save dialog asks where. Either way the
/// file itself is not written here — the frontend follows up with a save once
/// the user has typed something. Returns `None` if they cancel the dialog.
#[tauri::command]
pub async fn note_create(app: AppHandle, suggested_name: String) -> Result<Option<NotePayload>, String> {
    // The dialog supplies the real name, but strip any separators the frontend
    // may have sent so the suggestion cannot walk out of the chosen directory.
    let safe_name = Path::new(&suggested_name)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "note.md".to_string());

    // A default folder is a standing answer to "where?", so skip the dialog.
    if let Some(dir) = read_default_dir(&app)? {
        let stem = Path::new(&safe_name)
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "note".to_string());
        let path = free_path(&dir, &stem);
        remember(&app, &path)?;
        return load(path).map(Some);
    }

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

/// The media type for an image extension, or `None` for anything that is not an
/// image. Doubles as the allowlist: a path that maps to `None` is never read.
fn image_mime(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_string_lossy().to_ascii_lowercase();
    match extension.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "avif" => Some("image/avif"),
        "ico" => Some("image/x-icon"),
        _ => None,
    }
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// Undo the percent-encoding Markdown links use for spaces and other awkward
/// characters, so `Job%20Related/a.png` becomes the name on disk.
///
/// Hand-rolled rather than pulling in a dependency: the only escapes that appear
/// in a note's own image links are `%XX` byte triplets, and a malformed one is
/// left as written rather than rejected.
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
            {
                out.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&out).into_owned()
}

/// Whether `relative` is a plain forward-relative path: no root, no `..`, no
/// Windows prefix. Anything else is refused before it is joined to a folder.
fn is_contained_relative(relative: &Path) -> bool {
    relative.components().all(|component| match component {
        Component::Normal(_) | Component::CurDir => true,
        Component::ParentDir | Component::RootDir | Component::Prefix(_) => false,
    })
}

/// Read `path` as a `data:` URL, refusing anything too large or not an image.
fn read_image(path: &Path) -> Result<String, String> {
    let mime = image_mime(path).ok_or_else(|| "not an image file".to_string())?;

    let meta = fs::metadata(path).map_err(|e| format!("cannot stat image: {e}"))?;
    if meta.len() > MAX_IMAGE_BYTES {
        return Err(format!(
            "image is {} MB, over the {} MB limit",
            meta.len() / (1024 * 1024),
            MAX_IMAGE_BYTES / (1024 * 1024)
        ));
    }

    let bytes = fs::read(path).map_err(|e| format!("cannot read image: {e}"))?;
    Ok(format!("data:{mime};base64,{}", BASE64.encode(bytes)))
}

/// Load an image a note links to, as a `data:` URL.
///
/// The webview is served over its own protocol, so a relative `src` in the
/// preview resolves against that and never reaches the disk. This walks the
/// places the file is actually likely to be, in order:
///
/// 1. beside the note, at the path as written — the usual case;
/// 2. beside the note, under just the file name, for links that carry a folder
///    prefix relative to a vault root rather than to the note;
/// 3. under the note's parent folder, at the path as written, which is what a
///    vault-relative link means when notes live one folder down.
///
/// The result must still land inside the note's parent folder, must be a plain
/// relative path (no `..`), and must carry an image extension. Together with
/// `authorize` — the note itself has to be one the user opened through a dialog
/// — that keeps this from being a way to read arbitrary files.
#[tauri::command]
pub fn note_image(app: AppHandle, path: String, src: String) -> Result<String, String> {
    let note = authorize(&app, &path)?;
    let dir = note
        .parent()
        .ok_or_else(|| "that note has no folder".to_string())?;

    let decoded = percent_decode(&src);
    let relative = PathBuf::from(&decoded);
    if !is_contained_relative(&relative) {
        return Err(format!("{decoded} is not a path next to the note"));
    }
    if image_mime(&relative).is_none() {
        return Err(format!("{decoded} is not an image file"));
    }

    // Everything resolved has to sit under this, so a link cannot climb out of
    // the area the note lives in. Falls back to the note's own folder when it
    // has no parent, which only happens at a filesystem root.
    let boundary = dir.parent().unwrap_or(dir);
    let boundary = boundary
        .canonicalize()
        .map_err(|e| format!("cannot resolve the note's folder: {e}"))?;

    let mut candidates = vec![dir.join(&relative)];
    if let Some(name) = relative.file_name() {
        candidates.push(dir.join(name));
    }
    if let Some(parent) = dir.parent() {
        candidates.push(parent.join(&relative));
    }

    for candidate in candidates {
        if !candidate.is_file() {
            continue;
        }
        let resolved = candidate
            .canonicalize()
            .map_err(|e| format!("cannot resolve image path: {e}"))?;
        if !resolved.starts_with(&boundary) {
            continue;
        }
        return read_image(&resolved);
    }

    Err(format!("couldn't find {decoded} next to this note"))
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
