import { useCallback, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { FaFolderOpen, FaRegFileAlt } from "react-icons/fa";
import AppHome from "./AppHome";
import { appById } from "../nav/apps";
import { isTauri } from "../utils/platform";
import {
    createNote,
    pickNote,
    recentNotes,
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
    const fileInput = useRef<HTMLInputElement>(null);

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
                        <FaFolderOpen aria-hidden /> Browse and open
                    </button>
                    <button className="app-btn secondary" onClick={handleNew} disabled={busy}>
                        <FaRegFileAlt aria-hidden /> New note
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

            <section className="home-section">
                <h2>Recently opened</h2>

                {recents.length === 0 ? (
                    <p className="home-empty">
                        {isTauri()
                            ? "No notes yet. Browse to a .md file, or start a new one."
                            : "No notes yet. Import a .md file, or start a new one — in the browser they are kept in local storage."}
                    </p>
                ) : (
                    <ul className="note-recents">
                        {recents.map((entry) => (
                            <li key={sourceId(entry.source)}>
                                <button
                                    className="note-recent"
                                    onClick={() => onOpen(entry.source)}
                                    title={entry.source.kind === "file" ? entry.source.path : entry.name}
                                >
                                    <span className="note-recent-name">{entry.name}</span>
                                    <span className="note-recent-meta">
                                        {entry.mtime === null
                                            ? entry.source.kind === "store"
                                                ? "In app storage"
                                                : ""
                                            : `Edited ${dayjs(entry.mtime).format("MMM D, HH:mm")}`}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </AppHome>
    );
}
