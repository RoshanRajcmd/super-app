//! Native file access for the habit tracker spreadsheet.
//!
//! The webview never supplies a location. The user picks the `.csv` once through
//! the OS picker; that choice is persisted here, in the app-data directory, and
//! every later read and write resolves it again. So a compromised or buggy
//! frontend cannot redirect file I/O at an arbitrary file.
//!
//! A location comes in two shapes. Desktop gives a filesystem path. Android gives
//! a `content://` document URI from the Storage Access Framework, which has no
//! path behind it and is reached through the content resolver — see
//! [`crate::android_saf`] for why the picker there is not the dialog plugin's.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FilePath;

#[cfg(not(target_os = "android"))]
use tauri_plugin_dialog::DialogExt;

#[cfg(target_os = "android")]
use crate::android_saf::SafExt;

const POINTER_FILE: &str = "habit-sheet-path.txt";

/// A spreadsheet's bytes plus the modification time they were read at.
///
/// The frontend echoes `mtime` back when saving; a mismatch means something
/// else (usually Google Drive syncing another device's copy) rewrote the file
/// in the meantime, so the write is refused rather than clobbering it.
#[derive(Serialize)]
pub struct SheetPayload {
    /// For display only — a full path on desktop, the document's name on Android.
    pub path: String,
    /// Base64-encoded `.csv` bytes. `None` when the file does not exist yet.
    pub data: Option<String>,
    /// Milliseconds since the Unix epoch, or `None` if the file does not exist.
    pub mtime: Option<u64>,
}

/// Parse a remembered location. Anything that is not a URL is taken as a path,
/// so a plain path round-trips unchanged.
fn parse_location(raw: &str) -> FilePath {
    // `FilePath`'s parse error is `Infallible`.
    FilePath::from_str(raw).unwrap()
}

fn pointer_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create app data dir: {e}"))?;
    Ok(dir.join(POINTER_FILE))
}

fn read_pointer(app: &AppHandle) -> Result<Option<FilePath>, String> {
    let pointer = pointer_path(app)?;
    match fs::read_to_string(&pointer) {
        Ok(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(parse_location(trimmed)))
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("cannot read saved sheet path: {e}")),
    }
}

fn write_pointer(app: &AppHandle, loc: &FilePath) -> Result<(), String> {
    let pointer = pointer_path(app)?;
    fs::write(&pointer, raw_location(loc).as_bytes())
        .map_err(|e| format!("cannot save sheet path: {e}"))
}

/// The location as it is stored in the pointer file, i.e. what `parse_location`
/// reads back.
fn raw_location(loc: &FilePath) -> String {
    match loc {
        FilePath::Path(p) => p.to_string_lossy().into_owned(),
        FilePath::Url(u) => u.to_string(),
    }
}

/// What to show the user. A document URI is unreadable, so the provider's own
/// name for it is used where one is available.
fn label(app: &AppHandle, loc: &FilePath) -> String {
    match loc {
        FilePath::Path(p) => p.to_string_lossy().into_owned(),
        FilePath::Url(u) => uri_name(app, u.as_str()).unwrap_or_else(|| u.to_string()),
    }
}

#[cfg(target_os = "android")]
fn uri_name(app: &AppHandle, uri: &str) -> Option<String> {
    // A missing name is cosmetic, so a failed stat falls back rather than erroring.
    app.saf().stat(uri).ok().and_then(|stat| stat.name)
}

#[cfg(not(target_os = "android"))]
fn uri_name(_app: &AppHandle, _uri: &str) -> Option<String> {
    None
}

fn path_mtime_ms(path: &Path) -> Result<Option<u64>, String> {
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

#[cfg(target_os = "android")]
fn uri_mtime_ms(app: &AppHandle, uri: &str) -> Result<Option<u64>, String> {
    let stat = app.saf().stat(uri)?;
    Ok(if stat.exists { stat.mtime } else { None })
}

/// Only Android hands out document URIs, so one seen anywhere else can only have
/// arrived in a pointer file copied off an Android device.
#[cfg(not(target_os = "android"))]
fn uri_mtime_ms(_app: &AppHandle, uri: &str) -> Result<Option<u64>, String> {
    Err(format!("unsupported sheet location: {uri}"))
}

/// `None` when the sheet does not exist yet.
///
/// Note that a document provider is free not to report a modification time at
/// all, in which case this is `None` for a file that is plainly there. The
/// conflict check below degrades to letting the write through, which is the right
/// way round: refusing every save would be worse than missing a rare clash.
fn mtime_ms(app: &AppHandle, loc: &FilePath) -> Result<Option<u64>, String> {
    match loc {
        FilePath::Path(p) => path_mtime_ms(p),
        FilePath::Url(u) => uri_mtime_ms(app, u.as_str()),
    }
}

/// Open a document URI as an ordinary file, through the content resolver.
#[cfg(target_os = "android")]
fn open_uri(app: &AppHandle, loc: &FilePath, write: bool) -> Result<fs::File, String> {
    use tauri_plugin_fs::{FsExt, OpenOptions};

    let mut opts = OpenOptions::new();
    if write {
        // Truncating matters here: the resolver writes in place, so without it a
        // shorter CSV would leave the tail of the previous one behind.
        opts.write(true).truncate(true);
    } else {
        opts.read(true);
    }

    app.fs()
        .open(loc.clone(), opts.clone())
        .map_err(|e| format!("cannot open sheet: {e}"))
}

#[cfg(not(target_os = "android"))]
fn open_uri(_app: &AppHandle, loc: &FilePath, _write: bool) -> Result<fs::File, String> {
    Err(format!("unsupported sheet location: {}", raw_location(loc)))
}

fn read_bytes(app: &AppHandle, loc: &FilePath) -> Result<Option<Vec<u8>>, String> {
    match loc {
        FilePath::Path(p) => match fs::read(p) {
            Ok(bytes) => Ok(Some(bytes)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("cannot read sheet: {e}")),
        },
        FilePath::Url(_) => {
            let mut bytes = Vec::new();
            open_uri(app, loc, false)?
                .read_to_end(&mut bytes)
                .map_err(|e| format!("cannot read sheet: {e}"))?;
            // A document made through the save picker exists from that moment on
            // but holds nothing until the first write, so empty reads as absent —
            // the same signal a missing path gives.
            Ok(if bytes.is_empty() { None } else { Some(bytes) })
        }
    }
}

fn write_bytes(app: &AppHandle, loc: &FilePath, bytes: &[u8]) -> Result<(), String> {
    match loc {
        FilePath::Path(p) => {
            // Write to a sibling temp file and rename, so an interrupted write
            // cannot leave a half-written CSV behind.
            let temp = p.with_extension("csv.tmp");
            fs::write(&temp, bytes).map_err(|e| format!("cannot write sheet: {e}"))?;
            fs::rename(&temp, p).map_err(|e| {
                let _ = fs::remove_file(&temp);
                format!("cannot replace sheet: {e}")
            })
        }
        FilePath::Url(_) => {
            // No rename to hide behind: the framework exposes the document and
            // nothing alongside it, so this write is not atomic and an interrupted
            // save can leave a short CSV. Reload picks up whatever landed.
            let mut file = open_uri(app, loc, true)?;
            file.write_all(bytes)
                .map_err(|e| format!("cannot write sheet: {e}"))?;
            file.flush().map_err(|e| format!("cannot flush sheet: {e}"))
        }
    }
}

fn load(app: &AppHandle, loc: FilePath) -> Result<SheetPayload, String> {
    Ok(SheetPayload {
        mtime: mtime_ms(app, &loc)?,
        data: read_bytes(app, &loc)?.map(|bytes| BASE64.encode(bytes)),
        path: label(app, &loc),
    })
}

/// Strip any separators the frontend may have sent, so a suggested name cannot
/// walk out of the directory the user picks.
fn safe_name(suggested: &str) -> String {
    Path::new(suggested)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "habits.csv".to_string())
}

/// Browse for an existing sheet. `None` if the user cancels.
#[cfg(not(target_os = "android"))]
async fn pick_location(app: &AppHandle) -> Result<Option<FilePath>, String> {
    let Some(picked) = app
        .dialog()
        .file()
        .add_filter("CSV spreadsheet", &["csv"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };

    let path = picked
        .into_path()
        .map_err(|e| format!("unsupported file location: {e}"))?;
    Ok(Some(FilePath::Path(path)))
}

#[cfg(target_os = "android")]
async fn pick_location(app: &AppHandle) -> Result<Option<FilePath>, String> {
    Ok(app.saf().pick_file()?.as_deref().map(parse_location))
}

/// Ask where to put a new sheet. `None` if the user cancels.
#[cfg(not(target_os = "android"))]
async fn create_location(app: &AppHandle, file_name: &str) -> Result<Option<FilePath>, String> {
    let Some(picked) = app
        .dialog()
        .file()
        .add_filter("CSV spreadsheet", &["csv"])
        .set_file_name(file_name)
        .blocking_save_file()
    else {
        return Ok(None);
    };

    let mut path = picked
        .into_path()
        .map_err(|e| format!("unsupported file location: {e}"))?;
    if path.extension().is_none() {
        path.set_extension("csv");
    }
    Ok(Some(FilePath::Path(path)))
}

#[cfg(target_os = "android")]
async fn create_location(app: &AppHandle, file_name: &str) -> Result<Option<FilePath>, String> {
    // The MIME type drives the extension the framework settles on, and the user
    // can rename in the picker, so nothing is forced afterwards.
    Ok(app
        .saf()
        .create_file(file_name, "text/csv")?
        .as_deref()
        .map(parse_location))
}

/// The sheet the user chose previously, or `None` on first run.
#[tauri::command]
pub fn habit_sheet_current(app: AppHandle) -> Result<Option<SheetPayload>, String> {
    match read_pointer(&app)? {
        Some(loc) => load(&app, loc).map(Some),
        None => Ok(None),
    }
}

/// Browse for an existing `.csv` and remember it.
///
/// Returns `None` if the user cancels.
#[tauri::command]
pub async fn habit_sheet_pick(app: AppHandle) -> Result<Option<SheetPayload>, String> {
    let Some(loc) = pick_location(&app).await? else {
        return Ok(None);
    };

    write_pointer(&app, &loc)?;
    load(&app, loc).map(Some)
}

/// Choose where to create a new sheet and remember it.
///
/// No habits are written here; the frontend follows up with a save once it has
/// built the sheet. Returns `None` if the user cancels.
#[tauri::command]
pub async fn habit_sheet_create(
    app: AppHandle,
    suggested_name: String,
) -> Result<Option<SheetPayload>, String> {
    let Some(loc) = create_location(&app, &safe_name(&suggested_name)).await? else {
        return Ok(None);
    };

    write_pointer(&app, &loc)?;
    load(&app, loc).map(Some)
}

/// Write a copy of the sheet wherever the user chooses, leaving the tracked
/// file alone.
///
/// This is the native half of Export: the webview cannot start a download, so the
/// bytes go to the OS save picker instead. Returns the name written, or `None` if
/// the user cancels.
#[tauri::command]
pub async fn habit_sheet_export(
    app: AppHandle,
    data: String,
    suggested_name: String,
) -> Result<Option<String>, String> {
    let bytes = BASE64
        .decode(data.as_bytes())
        .map_err(|e| format!("malformed sheet payload: {e}"))?;

    let Some(loc) = create_location(&app, &safe_name(&suggested_name)).await? else {
        return Ok(None);
    };

    write_bytes(&app, &loc, &bytes)?;
    Ok(Some(label(&app, &loc)))
}

/// Modification time of the remembered sheet, without reading its bytes.
///
/// This is what the frontend polls to notice a copy synced in from another
/// machine. Reading the whole CSV every few seconds would work too, but a stat is
/// cheap enough to run while the app is idle on a phone. `None` both when no sheet
/// is selected and when the location cannot report a time, so a caller that needs
/// certainty has to fall back to reading.
#[tauri::command]
pub fn habit_sheet_mtime(app: AppHandle) -> Result<Option<u64>, String> {
    match read_pointer(&app)? {
        Some(loc) => mtime_ms(&app, &loc),
        None => Ok(None),
    }
}

/// Re-read the remembered sheet.
#[tauri::command]
pub fn habit_sheet_read(app: AppHandle) -> Result<SheetPayload, String> {
    let loc = read_pointer(&app)?.ok_or("no habit sheet selected yet")?;
    load(&app, loc)
}

/// Write base64 `.csv` bytes to the remembered sheet.
///
/// `expected_mtime` guards against overwriting a copy that changed underneath
/// us; pass `None` only when the file is not expected to exist yet. The new
/// mtime is returned so the frontend can track the file it just wrote, and is
/// `None` where the location cannot report one.
#[tauri::command]
pub fn habit_sheet_write(
    app: AppHandle,
    data: String,
    expected_mtime: Option<u64>,
) -> Result<Option<u64>, String> {
    let loc = read_pointer(&app)?.ok_or("no habit sheet selected yet")?;
    let bytes = BASE64
        .decode(data.as_bytes())
        .map_err(|e| format!("malformed sheet payload: {e}"))?;

    if mtime_ms(&app, &loc)? != expected_mtime {
        return Err("CONFLICT".to_string());
    }

    write_bytes(&app, &loc, &bytes)?;
    mtime_ms(&app, &loc)
}
