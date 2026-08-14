import { isTauri } from "./platform";
import { getStore } from "./keyValueStore";

/**
 * Filesystem shell for the note editor — the only module here that talks to the
 * outside world.
 *
 * On Tauri a note is a real `.md` the user picks or creates once; the path is
 * remembered by the Rust side, which also refuses to touch any path the user has
 * not chosen through a dialog or created under the folder they nominated. So the
 * webview cannot aim note I/O at an arbitrary file.
 *
 * In a plain browser there is no such file, so notes live in the key/value store.
 */

/** Key holding the browser's note bodies, as a name-keyed map. */
const BROWSER_NOTES_KEY = "browserNotes";
/** Key holding the browser's recent order, most recent first. */
const BROWSER_ORDER_KEY = "browserNoteOrder";
/** Where the app's original single note lives, from before notes were files. */
const LEGACY_NOTE_KEY = "note";

/** Display name for the pre-existing single note, so it is not orphaned. */
export const SCRATCH_NOTE_NAME = "Scratch note";

/**
 * Where a note's text lives.
 *
 * `file` is a real path on disk, only reachable on Tauri. `store` is a named
 * entry in the key/value store, which is how the browser keeps notes and how the
 * app's original single note is still reached on both platforms.
 */
export type NoteSource =
    | { kind: "file"; path: string; name: string }
    | { kind: "store"; name: string };

/** Stable identity for a source, for React keys and equality checks. */
export function sourceId(source: NoteSource): string {
    return source.kind === "file" ? `file:${source.path}` : `store:${source.name}`;
}

/** One entry in the "recently opened" list on the notes home page. */
export interface NoteEntry {
    source: NoteSource;
    name: string;
    /** Milliseconds since the Unix epoch, or `null` when unknown. */
    mtime: number | null;
}

export interface NoteHandle {
    source: NoteSource;
    /** `null` when the file does not exist yet, i.e. a freshly chosen location. */
    content: string | null;
    /**
     * Modification time the content was read at, echoed back on save to detect
     * concurrent writes. Always `null` for store-backed notes, which no other
     * program can touch.
     */
    mtime: number | null;
}

/** Raised when the file changed underneath us, usually a Drive sync. */
export class NoteConflictError extends Error {
    constructor() {
        super("The note changed on disk since it was opened.");
        this.name = "NoteConflictError";
    }
}

interface RawNote {
    path: string;
    name: string;
    content: string | null;
    mtime: number | null;
}

interface RawEntry {
    path: string;
    name: string;
    mtime: number | null;
}

async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
}

function toHandle(raw: RawNote): NoteHandle {
    return {
        source: { kind: "file", path: raw.path, name: raw.name },
        content: raw.content,
        mtime: raw.mtime,
    };
}

async function readBrowserNotes(): Promise<Record<string, string>> {
    return (await getStore().get<Record<string, string>>(BROWSER_NOTES_KEY)) ?? {};
}

async function readBrowserOrder(): Promise<string[]> {
    return (await getStore().get<string[]>(BROWSER_ORDER_KEY)) ?? [];
}

/** Move `name` to the front of the browser's recent order. */
async function rememberBrowser(name: string): Promise<void> {
    const order = (await readBrowserOrder()).filter((n) => n !== name);
    await getStore().set(BROWSER_ORDER_KEY, [name, ...order]);
}

/**
 * A name no note is using yet, so creating two notes on the same day does not
 * have the second silently replace the first.
 *
 * Only for notes the app names itself. An imported file keeps the name it came
 * with — see `pickNote`.
 */
function uniqueName(name: string, taken: Iterable<string>): string {
    const existing = new Set(taken);
    if (!existing.has(name)) return name;

    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    for (let n = 2; ; n++) {
        const candidate = `${stem} (${n})${extension}`;
        if (!existing.has(candidate)) return candidate;
    }
}

/**
 * Notes opened before, most recent first.
 *
 * The app's original single note is appended as `Scratch note` when it holds
 * anything, so upgrading does not lose what the user had written.
 */
export async function recentNotes(): Promise<NoteEntry[]> {
    const entries: NoteEntry[] = [];

    if (isTauri()) {
        const raw = await invokeTauri<RawEntry[]>("note_recents");
        entries.push(
            ...raw.map((r) => ({
                source: { kind: "file" as const, path: r.path, name: r.name },
                name: r.name,
                mtime: r.mtime,
            }))
        );
    } else {
        const notes = await readBrowserNotes();
        const order = await readBrowserOrder();
        // Anything present but unordered (imported on an older build) still shows,
        // just after the notes whose order is known.
        const names = [
            ...order.filter((n) => n in notes),
            ...Object.keys(notes).filter((n) => !order.includes(n)),
        ];
        entries.push(
            ...names.map((name) => ({
                source: { kind: "store" as const, name },
                name,
                mtime: null,
            }))
        );
    }

    const legacy = await getStore().get<string>(LEGACY_NOTE_KEY);
    if (legacy !== null && legacy.trim() !== "") {
        entries.push({
            source: { kind: "store", name: SCRATCH_NOTE_NAME },
            name: SCRATCH_NOTE_NAME,
            mtime: null,
        });
    }

    return entries;
}

/**
 * Ask the user to pick an existing note.
 *
 * Returns `null` if they cancel. In the browser the caller supplies the file
 * from an input, since there is no OS picker to reach for.
 */
export async function pickNote(browserFile?: File): Promise<NoteHandle | null> {
    if (!isTauri()) {
        if (!browserFile) return null;

        // The file name is the identity: re-importing a file the user already
        // imported refreshes that note rather than making a second copy under a
        // suffixed name. On Tauri the path plays the same role.
        const name = browserFile.name;
        const content = await browserFile.text();
        const notes = await readBrowserNotes();

        await getStore().set(BROWSER_NOTES_KEY, { ...notes, [name]: content });
        await rememberBrowser(name);
        return { source: { kind: "store", name }, content, mtime: null };
    }

    const raw = await invokeTauri<RawNote | null>("note_pick");
    return raw === null ? null : toHandle(raw);
}

/**
 * Ask the user where to create a new note.
 *
 * On Tauri the file is not written yet — `content` comes back `null` and the
 * editor saves once there is something to save. Returns `null` if they cancel.
 */
export async function createNote(suggestedName: string): Promise<NoteHandle | null> {
    if (!isTauri()) {
        const notes = await readBrowserNotes();
        const name = uniqueName(suggestedName, Object.keys(notes));
        await getStore().set(BROWSER_NOTES_KEY, { ...notes, [name]: "" });
        await rememberBrowser(name);
        return { source: { kind: "store", name }, content: null, mtime: null };
    }

    const raw = await invokeTauri<RawNote | null>("note_create", {
        suggestedName,
    });
    return raw === null ? null : toHandle(raw);
}

/** Read a note the user has opened before. */
export async function openNote(source: NoteSource): Promise<NoteHandle> {
    if (source.kind === "store") {
        if (source.name === SCRATCH_NOTE_NAME) {
            const content = await getStore().get<string>(LEGACY_NOTE_KEY);
            return { source, content, mtime: null };
        }

        const notes = await readBrowserNotes();
        await rememberBrowser(source.name);
        return { source, content: notes[source.name] ?? null, mtime: null };
    }

    return toHandle(await invokeTauri<RawNote>("note_open", { path: source.path }));
}

/**
 * Write a note back, refusing if the file changed since `expectedMtime`.
 *
 * Returns the new modification time. Throws `NoteConflictError` when the on-disk
 * file no longer matches, so the caller can reload rather than overwrite
 * someone else's edits.
 */
export async function saveNoteTo(
    source: NoteSource,
    content: string,
    expectedMtime: number | null
): Promise<number | null> {
    if (source.kind === "store") {
        if (source.name === SCRATCH_NOTE_NAME) {
            await getStore().set(LEGACY_NOTE_KEY, content);
            return null;
        }

        const notes = await readBrowserNotes();
        await getStore().set(BROWSER_NOTES_KEY, { ...notes, [source.name]: content });
        return null;
    }

    try {
        return await invokeTauri<number>("note_write", {
            path: source.path,
            content,
            expectedMtime,
        });
    } catch (error) {
        if (String(error).includes("CONFLICT")) throw new NoteConflictError();
        throw error;
    }
}

/**
 * Resolved image data URLs, keyed by note path and link.
 *
 * The preview re-renders on every keystroke, so without this each render would
 * re-read and re-encode every image in the note. Cleared when the editor moves
 * to another note, which is also when a replaced image file gets picked up.
 */
const imageCache = new Map<string, Promise<string>>();

/** Forget cached images. Called when the editor opens a different note. */
export function clearNoteImageCache(): void {
    imageCache.clear();
}

/**
 * Load an image a note links to by a relative path, as a `data:` URL.
 *
 * Only meaningful for file-backed notes: a store-backed note has no folder for
 * the link to be relative to, so this rejects rather than guessing.
 */
export function noteImage(source: NoteSource, src: string): Promise<string> {
    if (source.kind !== "file") {
        return Promise.reject(
            new Error("images need a note stored as a file, not one in app storage")
        );
    }

    const key = `${source.path}\u0000${src}`;
    const cached = imageCache.get(key);
    if (cached) return cached;

    const pending = invokeTauri<string>("note_image", { path: source.path, src });
    imageCache.set(key, pending);
    // A failed read should be retried the next time the note is opened rather
    // than cached as a permanent failure.
    pending.catch(() => imageCache.delete(key));
    return pending;
}

/**
 * The folder new notes are created in, or `null` while none is set.
 *
 * Browser-only notes have no folder to speak of, so this is always `null` there.
 */
export async function defaultNoteDir(): Promise<string | null> {
    if (!isTauri()) return null;
    return await invokeTauri<string | null>("note_default_dir");
}

/**
 * Ask the user which folder new notes should go into.
 *
 * Returns the chosen folder, or `null` if they cancel.
 */
export async function pickDefaultNoteDir(): Promise<string | null> {
    if (!isTauri()) return null;
    return await invokeTauri<string | null>("note_pick_default_dir");
}

/**
 * Set the folder new notes go into from a path the user typed.
 *
 * Returns the folder as it resolved on disk. Android's folder picker returns a
 * `content://` URI with no path behind it, so on that platform this is the only
 * way to set the folder at all.
 */
export async function setDefaultNoteDir(path: string): Promise<string> {
    if (!isTauri()) throw new Error("note folders only exist in the app, not the browser");
    return await invokeTauri<string>("note_set_default_dir", { path });
}

/**
 * Open a note from a path the user typed, for the same reason as
 * {@link setDefaultNoteDir}.
 */
export async function openNotePath(path: string): Promise<NoteHandle> {
    if (!isTauri()) throw new Error("opening by path only works in the app, not the browser");
    return toHandle(await invokeTauri<RawNote>("note_open_path", { path }));
}

/** Forget the default folder, so creating a note asks where to put it again. */
export async function clearDefaultNoteDir(): Promise<void> {
    if (!isTauri()) return;
    await invokeTauri<null>("note_clear_default_dir");
}
