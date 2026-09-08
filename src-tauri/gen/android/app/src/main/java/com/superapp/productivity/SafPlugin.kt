package com.superapp.productivity

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import androidx.activity.result.ActivityResult
import app.tauri.Logger
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class CreateFileArgs {
    lateinit var fileName: String
    lateinit var mimeType: String
}

@InvokeArg
class UriArgs {
    lateinit var uri: String
}

/**
 * Storage Access Framework picker, for documents the user browses to.
 *
 * `tauri-plugin-dialog` already has a picker, but it launches
 * `ACTION_GET_CONTENT`, which grants read access for the life of the process
 * only. A habit sheet has to be written back and reopened next launch, so this
 * uses `ACTION_OPEN_DOCUMENT` / `ACTION_CREATE_DOCUMENT` and takes a persistable
 * read-write grant on the result.
 *
 * Reading and writing are not here: `tauri-plugin-fs` opens a `content://` URI
 * as a file descriptor already, so the Rust side does the I/O. See
 * `src-tauri/src/android_saf.rs`, which registers this class.
 */
@TauriPlugin
class SafPlugin(private val activity: Activity) : Plugin(activity) {
    private val readWrite =
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION

    @Command
    fun pickFile(invoke: Invoke) {
        // No MIME filter. Providers disagree wildly about what a `.csv` is —
        // text/csv, application/vnd.ms-excel and application/octet-stream all
        // turn up — so filtering mostly succeeds at hiding the file the user
        // came to find.
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            addFlags(readWrite or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        startActivityForResult(invoke, intent, "documentResult")
    }

    @Command
    fun createFile(invoke: Invoke) {
        val args = invoke.parseArgs(CreateFileArgs::class.java)
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = args.mimeType
            putExtra(Intent.EXTRA_TITLE, args.fileName)
            addFlags(readWrite or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        startActivityForResult(invoke, intent, "documentResult")
    }

    /** Shared by both pickers: each returns one document, or nothing. */
    @ActivityCallback
    fun documentResult(invoke: Invoke, result: ActivityResult) {
        val response = JSObject()

        // A dismissed picker is an ordinary outcome, not a failure, so the URI
        // comes back absent rather than as a rejection.
        val uri = if (result.resultCode == Activity.RESULT_OK) result.data?.data else null
        if (uri == null) {
            invoke.resolve(response)
            return
        }

        try {
            activity.contentResolver.takePersistableUriPermission(uri, readWrite)
        } catch (e: SecurityException) {
            // Some providers hand out a grant they will not persist. The URI still
            // works for this run, so the pick is not failed here; the user will be
            // asked for the file again on a later launch.
            Logger.error(getLogTag(), "cannot persist access to $uri", e)
        }

        response.put("uri", uri.toString())
        invoke.resolve(response)
    }

    @Command
    fun stat(invoke: Invoke) {
        val args = invoke.parseArgs(UriArgs::class.java)
        val response = JSObject()

        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        )
        val cursor = try {
            activity.contentResolver.query(Uri.parse(args.uri), projection, null, null, null)
        } catch (_: SecurityException) {
            // The persisted grant is gone, usually because the user revoked it or
            // the provider was reinstalled. Distinct from "no such document": the
            // file may well still be there, it just cannot be reached any more.
            invoke.reject("access to that file was withdrawn, so pick it again")
            return
        }

        cursor?.use {
            if (it.moveToFirst()) {
                response.put("exists", true)
                column(it, DocumentsContract.Document.COLUMN_LAST_MODIFIED)?.let { index ->
                    response.put("mtime", it.getLong(index))
                }
                column(it, DocumentsContract.Document.COLUMN_DISPLAY_NAME)?.let { index ->
                    response.put("name", it.getString(index))
                }
                invoke.resolve(response)
                return
            }
        }

        response.put("exists", false)
        invoke.resolve(response)
    }

    /** Index of [name], or null when the provider does not report that column. */
    private fun column(cursor: android.database.Cursor, name: String): Int? {
        val index = cursor.getColumnIndex(name)
        return if (index == -1 || cursor.isNull(index)) null else index
    }
}
