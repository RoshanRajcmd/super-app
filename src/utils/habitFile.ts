import { isTauri } from "./platform";
import { getStore } from "./keyValueStore";

/**
 * Filesystem shell for the habit spreadsheet — the only module here that talks
 * to the outside world.
 *
 * On Tauri the bytes live in a real `.csv` the user picks once, typically
 * inside their Google Drive folder so the desktop Drive client syncs every
 * write. The path is held by the Rust side, not passed from here, so the webview
 * cannot aim file I/O at an arbitrary file.
 *
 * In a plain browser there is no such file, so the CSV contents are kept in the
 * key/value store and the user exports it by download.
 */

const BROWSER_DATA_KEY = "habitSheetData";
const BROWSER_NAME_KEY = "habitSheetName";

/** Raised when the file changed underneath us, usually a Drive sync from another device. */
export class SheetConflictError extends Error {
    constructor() {
        super("The spreadsheet changed on disk since it was loaded.");
        this.name = "SheetConflictError";
    }
}

export interface SheetHandle {
    /** Real path on Tauri; a display name in the browser. */
    path: string;
    /** `null` when the file does not exist yet, i.e. a freshly chosen location. */
    bytes: Uint8Array | null;
    /**
     * Modification time the bytes were read at, echoed back on save to detect
     * concurrent writes. Always `null` in the browser, which has no shared file.
     */
    mtime: number | null;
}

interface RawPayload {
    path: string;
    data: string | null;
    mtime: number | null;
}

function decode(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function encode(bytes: Uint8Array): string {
    // Chunked to stay well clear of the argument-count limit on String.fromCharCode
    // for a full year's worth of columns.
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function toHandle(payload: RawPayload): SheetHandle {
    return {
        path: payload.path,
        bytes: payload.data === null ? null : decode(payload.data),
        mtime: payload.mtime,
    };
}

async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
}

/** The sheet chosen on a previous run, or `null` if there is none yet. */
export async function currentSheet(): Promise<SheetHandle | null> {
    if (!isTauri()) {
        const data = await getStore().get<string>(BROWSER_DATA_KEY);
        if (data === null) return null;
        const name = (await getStore().get<string>(BROWSER_NAME_KEY)) ?? "habits.csv";
        return { path: name, bytes: decode(data), mtime: null };
    }

    const payload = await invokeTauri<RawPayload | null>("habit_sheet_current");
    return payload === null ? null : toHandle(payload);
}

/**
 * Read a file the user chose through an `<input type="file">`.
 *
 * `arrayBuffer()` is missing on the File implementations some Android and older
 * iOS webviews ship, and on anything handed over as a Blob-like object, so fall
 * back to FileReader rather than failing the import.
 */
async function readFileBytes(file: File): Promise<Uint8Array> {
    if (typeof file.arrayBuffer === "function") {
        return new Uint8Array(await file.arrayBuffer());
    }

    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error("could not read that file"));
        reader.readAsArrayBuffer(file);
    });
    return new Uint8Array(buffer);
}

/**
 * Ask the user to pick an existing `.csv`, which becomes the sheet the tracker
 * reads and writes from here on.
 *
 * Returns `null` if they cancel. On Tauri the OS picker supplies a real path; in
 * the browser there is none, so the caller passes the `File` from an input and
 * the bytes are copied into the key/value store.
 */
export async function pickSheet(browserFile?: File): Promise<SheetHandle | null> {
    if (!isTauri()) {
        if (!browserFile) return null;
        const bytes = await readFileBytes(browserFile);
        await getStore().set(BROWSER_DATA_KEY, encode(bytes));
        await getStore().set(BROWSER_NAME_KEY, browserFile.name);
        return { path: browserFile.name, bytes, mtime: null };
    }

    const payload = await invokeTauri<RawPayload | null>("habit_sheet_pick");
    return payload === null ? null : toHandle(payload);
}

/**
 * Ask the user where to create a new sheet.
 *
 * The file is not written yet — `bytes` comes back `null` and the caller saves
 * once it has built the sheet. Returns `null` if they cancel.
 */
export async function createSheetLocation(suggestedName: string): Promise<SheetHandle | null> {
    if (!isTauri()) {
        await getStore().set(BROWSER_NAME_KEY, suggestedName);
        return { path: suggestedName, bytes: null, mtime: null };
    }

    const payload = await invokeTauri<RawPayload | null>("habit_sheet_create", {
        suggestedName,
    });
    return payload === null ? null : toHandle(payload);
}

/** Re-read the chosen sheet, picking up edits made in Excel or synced from another device. */
export async function reloadSheet(): Promise<SheetHandle> {
    if (!isTauri()) {
        const existing = await currentSheet();
        if (existing === null) throw new Error("No spreadsheet loaded.");
        return existing;
    }

    return toHandle(await invokeTauri<RawPayload>("habit_sheet_read"));
}

/**
 * Write the sheet back, refusing if the file changed since `expectedMtime`.
 *
 * Returns the new modification time. Throws `SheetConflictError` when the
 * on-disk file no longer matches, so the caller can reload rather than
 * overwrite someone else's edits.
 */
export async function saveSheet(bytes: Uint8Array, expectedMtime: number | null): Promise<number | null> {
    if (!isTauri()) {
        await getStore().set(BROWSER_DATA_KEY, encode(bytes));
        return null;
    }

    try {
        return await invokeTauri<number>("habit_sheet_write", {
            data: encode(bytes),
            expectedMtime,
        });
    } catch (error) {
        if (String(error).includes("CONFLICT")) throw new SheetConflictError();
        throw error;
    }
}

/**
 * Save a copy of the sheet somewhere of the user's choosing, leaving the tracked
 * file as it is.
 *
 * On Tauri that is an OS save dialog, since a webview cannot start a download;
 * in the browser it is a download, there being no filesystem to write to.
 * Returns the path written on Tauri, and `null` in the browser or on cancel.
 */
export async function exportSheet(bytes: Uint8Array, fileName: string): Promise<string | null> {
    if (isTauri()) {
        return await invokeTauri<string | null>("habit_sheet_export", {
            data: encode(bytes),
            suggestedName: fileName,
        });
    }

    // Copy into a fresh buffer: the view may sit inside a larger ArrayBuffer.
    const blob = new Blob([bytes.slice()], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return null;
}
