//! Storage Access Framework bridge: the only way to reach a file the user
//! browses to on Android.
//!
//! `tauri-plugin-dialog` cannot serve here. Its picker launches
//! `Intent.ACTION_GET_CONTENT`, whose grant is read-only and lasts only as long
//! as the process, so a sheet chosen through it could be neither written back
//! nor reopened on the next launch. This plugin launches `ACTION_OPEN_DOCUMENT`
//! and `ACTION_CREATE_DOCUMENT` instead and calls
//! `takePersistableUriPermission`, which yields a `content://` URI that stays
//! readable and writable across restarts.
//!
//! Only picking and stat'ing need native code. Reading and writing go through
//! `tauri-plugin-fs`, which already turns a `content://` URI into an ordinary
//! `std::fs::File` by way of the content resolver.
//!
//! Android only: the Kotlin class lives in the generated project, at
//! `gen/android/app/src/main/java/com/superapp/productivity/SafPlugin.kt`.

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{Manager, Runtime};

/// Matches the package the Kotlin class is compiled into.
const PLUGIN_IDENTIFIER: &str = "com.superapp.productivity";
const PLUGIN_CLASS: &str = "SafPlugin";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateFileArgs<'a> {
    file_name: &'a str,
    mime_type: &'a str,
}

#[derive(Serialize)]
struct UriArgs<'a> {
    uri: &'a str,
}

/// A document the user chose, or nothing if they dismissed the picker.
#[derive(Deserialize)]
struct PickedDocument {
    /// Absent when the picker was cancelled.
    #[serde(default)]
    uri: Option<String>,
}

/// What the document provider reports about a URI.
#[derive(Deserialize)]
pub struct DocumentStat {
    pub exists: bool,
    /// Milliseconds since the Unix epoch. Providers are not obliged to report a
    /// modification time, so this is `None` more often than for a real file.
    #[serde(default)]
    pub mtime: Option<u64>,
    /// The name to show the user, a document URI being unreadable.
    #[serde(default)]
    pub name: Option<String>,
}

pub struct Saf<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> Saf<R> {
    /// Browse for an existing document, returning its URI, or `None` on cancel.
    ///
    /// Blocks until the user is done with the picker. Safe from a command: Tauri
    /// runs those off the Android UI thread, and the reply is delivered from it.
    pub fn pick_file(&self) -> Result<Option<String>, String> {
        let picked: PickedDocument = self
            .0
            .run_mobile_plugin("pickFile", ())
            .map_err(|e| format!("could not open the file picker: {e}"))?;
        Ok(picked.uri)
    }

    /// Ask the user where to create a document, returning its URI, or `None` on
    /// cancel. The document exists but is empty once this returns.
    pub fn create_file(&self, file_name: &str, mime_type: &str) -> Result<Option<String>, String> {
        let created: PickedDocument = self
            .0
            .run_mobile_plugin(
                "createFile",
                CreateFileArgs {
                    file_name,
                    mime_type,
                },
            )
            .map_err(|e| format!("could not open the save picker: {e}"))?;
        Ok(created.uri)
    }

    pub fn stat(&self, uri: &str) -> Result<DocumentStat, String> {
        self.0
            .run_mobile_plugin("stat", UriArgs { uri })
            .map_err(|e| format!("{e}"))
    }
}

pub trait SafExt<R: Runtime> {
    fn saf(&self) -> &Saf<R>;
}

impl<R: Runtime, T: Manager<R>> SafExt<R> for T {
    fn saf(&self) -> &Saf<R> {
        self.state::<Saf<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("saf")
        .setup(|app, api| {
            app.manage(Saf(
                api.register_android_plugin(PLUGIN_IDENTIFIER, PLUGIN_CLASS)?,
            ));
            Ok(())
        })
        .build()
}
