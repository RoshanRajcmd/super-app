import { useCallback, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { FaFolderOpen } from "react-icons/fa";
import { VscNewFile } from "react-icons/vsc";
import AppHome from "./AppHome";
import { appById } from "../nav/apps";
import { isTauri } from "../utils/platform";
import { detectShell } from "../utils/shell";
import {
    clearDefaultNoteDir,
    createNote,
    defaultNoteDir,
    openNotePath,
    pickDefaultNoteDir,
    pickNote,
    recentNotes,
    setDefaultNoteDir,
    sourceId,
    type NoteEntry,
    type NoteSource,
} from "../utils/noteFile";

interface NotesHomeProps {
    /** Open this note in the editor. */
    onOpen: (source: NoteSource) => void;
}

/** Home page for the note editor: get into a note, or back into a recent one. */
export default function NotesHome({ onOpen }: NotesHomeProps) {
    const [recents, setRecents] = useState<NoteEntry[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /** Folder new notes go into, or `null` while the user is asked each time. */
    const [defaultDir, setDefaultDir] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    /**
     * Typed-in paths, for Android.
     *
     * Android's file and folder pickers hand back `content://` URIs, which have no
     * filesystem path behind them: they cannot be re-opened later, written back
     * to, or looked beside for a note's images. So on Android the way in is a path
     * the user types, which the Rust side then treats as a note it may touch.
     */
    const [notePath, setNotePath] = useState("");
    const [folderPath, setFolderPath] = useState("");

    /** Fixed for the life of the process, so it is not worth state. */
    const onAndroid = detectShell() === "android";

    const refresh = useCallback(async () => {
        try {
            setRecents(await recentNotes());
            setError(null);
        } catch (e) {
            setError(`Couldn't list your recent notes: ${String(e)}`);
        }
    }, []);

    // Re-read on every mount, so a note opened and closed shows up at the top
    // when the editor returns here.
    useEffect(() => {
        let active = true;

        recentNotes()
            .then((entries) => {
                if (active) setRecents(entries);
            })
            .catch((e) => {
                if (active) setError(`Couldn't list your recent notes: ${String(e)}`);
            });

        // The setting only affects new notes, so a failure to read it is not
        // worth an error banner — the save dialog just asks where instead.
        defaultNoteDir()
            .then((dir) => {
                if (active) setDefaultDir(dir);
            })
            .catch((e) => console.error("Failed to read the default note folder:", e));

        return () => {
            active = false;
        };
    }, []);

    async function handleBrowse(browserFile?: File) {
        setBusy(true);
        setError(null);
        try {
            const handle = await pickNote(browserFile);
            if (!handle) return;
            await refresh();
            onOpen(handle.source);
        } catch (e) {
            setError(`Couldn't open that note: ${String(e)}`);
        } finally {
            setBusy(false);
        }
    }

    async function handleNew() {
        setBusy(true);
        setError(null);
        try {
            const handle = await createNote(`note-${dayjs().format("YYYY-MM-DD")}.md`);
            if (!handle) return;
            await refresh();
            onOpen(handle.source);
        } catch (e) {
            setError(`Couldn't create that note: ${String(e)}`);
        } finally {
            setBusy(false);
        }
    }

    /** Choose the folder new notes are created in from now on. */
    async function handlePickDefaultDir() {
        setBusy(true);
        setError(null);
        try {
            const dir = await pickDefaultNoteDir();
            // `null` means they cancelled, so the existing setting stands.
            if (dir !== null) setDefaultDir(dir);
        } catch (e) {
            setError(`Couldn't set that folder: ${String(e)}`);
        } finally {
            setBusy(false);
        }
    }

    /** Open the note at the typed path. */
    async function handleOpenPath() {
        const path = notePath.trim();
        if (path === "") return;

        setBusy(true);
        setError(null);
        try {
            const handle = await openNotePath(path);
            setNotePath("");
            await refresh();
            onOpen(handle.source);
        } catch (e) {
            setError(`Couldn't open that path: ${String(e)}`);
        } finally {
            setBusy(false);
        }
    }

    /** Point new notes at the typed folder. */
    async function handleSetDefaultDir() {
        const path = folderPath.trim();
        if (path === "") return;

        setBusy(true);
        setError(null);
        try {
            setDefaultDir(await setDefaultNoteDir(path));
            setFolderPath("");
        } catch (e) {
            setError(`Couldn't set that folder: ${String(e)}`);
        } finally {
            setBusy(false);
        }
    }

    /** Go back to being asked where each new note should go. */
    async function handleClearDefaultDir() {
        setBusy(true);
        setError(null);
        try {
            await clearDefaultNoteDir();
            setDefaultDir(null);
        } catch (e) {
            setError(`Couldn't clear that folder: ${String(e)}`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <AppHome
            app={appById("notes")}
            actions={
                <>
                    <button
                        className="app-btn"
                        onClick={() => (isTauri() ? handleBrowse() : fileInput.current?.click())}
                        disabled={busy}
                    >
                        <FaFolderOpen size="20px" aria-hidden /> Browse
                    </button>
                    <button className="app-btn secondary" onClick={handleNew} disabled={busy}>
                        <VscNewFile size="20px" aria-hidden /> New note
                    </button>
                    {!isTauri() && (
                        <input
                            ref={fileInput}
                            type="file"
                            accept=".md,.markdown,.txt,text/markdown,text/plain"
                            hidden
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleBrowse(file);
                                e.target.value = "";
                            }}
                        />
                    )}
                </>
            }
        >
            {error && <div className="home-error">{error}</div>}

            {/* Android only: its pickers cannot give back a usable path, so a note
                is reached by typing where it is. Once opened it joins the recents
                list and is one tap away from then on. */}
            {onAndroid && (
                <section className="home-section">
                    <h2>Open by path</h2>
                    <p className="home-empty">
                        Android's file picker hands back a temporary link rather than a path, so
                        type where the note is — for example{" "}
                        <code>/storage/emulated/0/Documents/Notes/plan.md</code>. It needs all-files
                        access, granted once in Android settings.
                    </p>
                    <div className="note-setting-actions">
                        <input
                            className="note-path-input"
                            type="text"
                            value={notePath}
                            placeholder="/storage/emulated/0/…/note.md"
                            aria-label="Path to a note"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            onChange={(e) => setNotePath(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleOpenPath();
                            }}
                        />
                        <button
                            className="app-btn"
                            onClick={handleOpenPath}
                            disabled={busy || notePath.trim() === ""}
                        >
                            Open
                        </button>
                    </div>
                </section>
            )}

            <section className="home-section">
                <h2>Recently opened</h2>

                {recents.length === 0 ? (
                    <p className="home-empty">
                        {isTauri()
                            ? "No notes yet. Browse to a .md file, or start a new one."
                            : "No notes yet. Import a .md file, or start a new one — in the browser they are kept in local storage."}
                    </p>
                ) : (
                    <>
                        <ul className="note-recents">
                            {recents.map((entry) => (
                                <li key={sourceId(entry.source)}>
                                    <button
                                        className="note-recent"
                                        onClick={() => onOpen(entry.source)}
                                        title={
                                            entry.source.kind === "file"
                                                ? entry.source.path
                                                : entry.name
                                        }
                                    >
                                        <span className="note-recent-name">{entry.name}</span>
                                        {/* Where the note lives: the full path for a
                                            real file, so two notes with the same name
                                            are told apart. A store-backed note has no
                                            path to show — in the browser the picked
                                            file was copied in, and the browser does
                                            not reveal where it came from. */}
                                        <span className="note-recent-where">
                                            {entry.source.kind === "file"
                                                ? entry.source.path
                                                : "In app storage"}
                                        </span>
                                        <span className="note-recent-meta">
                                            {entry.mtime === null
                                                ? ""
                                                : `Edited ${dayjs(entry.mtime).format("MMM D, HH:mm")}`}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {/* Desktop rows carry the file's path. The browser cannot:
                            a picked file exposes its name and nothing else, so notes
                            are copied into app storage and edits stay there. */}
                        {!isTauri() && (
                            <p className="home-hint">
                                In the browser, notes are copied into app storage —
                                your edits do not reach the file you imported. Use the
                                desktop app to edit files in place.
                            </p>
                        )}
                    </>
                )}
            </section>

            {/* Browser notes have no folder, so the setting is desktop-only. */}
            {isTauri() && (
                <section className="home-section">
                    <h2>New note location</h2>
                    <p className="home-empty">
                        {defaultDir === null
                            ? "You are asked where to save each new note. Pick a folder to skip that."
                            : `New notes are saved in ${defaultDir}`}
                    </p>
                    {onAndroid && (
                        <div className="note-setting-actions">
                            <input
                                className="note-path-input"
                                type="text"
                                value={folderPath}
                                placeholder="/storage/emulated/0/Documents/Notes"
                                aria-label="Path to a folder"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                onChange={(e) => setFolderPath(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSetDefaultDir();
                                }}
                            />
                            <button
                                className="app-btn"
                                onClick={handleSetDefaultDir}
                                disabled={busy || folderPath.trim() === ""}
                            >
                                Use folder
                            </button>
                        </div>
                    )}
                    <div className="note-setting-actions">
                        {/* The picker is left in place off Android, where it works. */}
                        {!onAndroid && (
                            <button
                                className="app-btn"
                                onClick={handlePickDefaultDir}
                                disabled={busy}
                            >
                                <FaFolderOpen size="20px" aria-hidden />{" "}
                                {defaultDir === null ? "Choose folder" : "Change folder"}
                            </button>
                        )}
                        {defaultDir !== null && (
                            <button
                                className="app-btn secondary"
                                onClick={handleClearDefaultDir}
                                disabled={busy}
                            >
                                Ask each time
                            </button>
                        )}
                    </div>
                </section>
            )}
        </AppHome>
    );
}
