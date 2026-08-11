import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { FaSave, FaRegEdit, FaDownload } from "react-icons/fa";
import { IoChevronBackCircle } from "react-icons/io5";
import SidebarButton from "./components/SidebarButton";
import { isTauri } from "./utils/platform";
import {
    NoteConflictError,
    downloadNote,
    openNote,
    saveNoteTo,
    type NoteSource,
} from "./utils/noteFile";
import "./styles/NoteEditor.css";

interface NoteEditorProps {
    /** Which note to edit. */
    source: NoteSource;
    onBack: () => void;
}

const FALLBACK_NOTE = "# New Note\n\nStart writing...";

export default function NoteEditor({ source, onBack }: NoteEditorProps) {
    const [note, setNote] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Modification time the open note was read at, echoed back on save so a copy
     * changed underneath us (an editor, or a Drive sync) is not clobbered.
     * A ref, not state: it is bookkeeping for the next write, and nothing renders
     * from it.
     */
    const mtime = useRef<number | null>(null);

    // Load whenever the note changes. The file is an external system, so reading
    // it here is the intended use of an effect.
    useEffect(() => {
        let active = true;

        openNote(source)
            .then((handle) => {
                if (!active) return;
                mtime.current = handle.mtime;
                // A note created but not yet written has no content; seed it so
                // the preview is not blank.
                setNote(handle.content ?? FALLBACK_NOTE);
                setError(null);
                // A brand-new note is there to be written, so start in edit mode.
                setIsEditing(handle.content === null);
            })
            .catch((e) => {
                if (!active) return;
                setNote(FALLBACK_NOTE);
                setError(`Couldn't open that note: ${String(e)}`);
            });

        return () => {
            active = false;
        };
    }, [source]);

    /** Persist the note. Returns false if the write failed, so callers can stay put. */
    const persist = useCallback(async (): Promise<boolean> => {
        setIsSaving(true);
        try {
            mtime.current = await saveNoteTo(source, note, mtime.current);
            setError(null);
            return true;
        } catch (e) {
            if (e instanceof NoteConflictError) {
                // The on-disk copy wins: overwriting a sync from another device
                // would lose data the user cannot get back.
                const handle = await openNote(source);
                mtime.current = handle.mtime;
                setNote(handle.content ?? "");
                setError(
                    "The note changed elsewhere (probably a Drive sync), so it was reloaded and your last edit was not saved."
                );
                return false;
            }
            setError(`Couldn't save: ${String(e)}`);
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [note, source]);

    async function handleSave() {
        if (await persist()) setIsEditing(false);
    }

    /**
     * There is no discard path, so leaving always commits what is on screen.
     * Saved unconditionally rather than on a dirty check: the write is cheap and
     * it keeps the file the single source of truth once Drive sync is watching it.
     */
    async function handleBack() {
        if (await persist()) onBack();
    }

    const title = source.name;

    return (
        <div className="note-editor">
            <div className="note-header">
                <SidebarButton />
                <button
                    className="back-btn icon-btn"
                    onClick={handleBack}
                    disabled={isSaving}
                    aria-label="Back"
                    title="Back (saves)"
                >
                    <IoChevronBackCircle aria-hidden />
                </button>
                <h1 title={source.kind === "file" ? source.path : title}>📝 {title}</h1>
                <div className="note-actions">
                    {/* Browser notes live in local storage, so a download is the
                        only way out to a real file. */}
                    {!isTauri() && (
                        <button
                            className="export-btn icon-btn"
                            onClick={() => downloadNote(note, title)}
                            aria-label="Download"
                            title="Download a copy"
                        >
                            <FaDownload aria-hidden />
                        </button>
                    )}
                    {isEditing ? (
                        <button
                            className="save-btn icon-btn"
                            onClick={handleSave}
                            disabled={isSaving}
                            aria-label={isSaving ? "Saving" : "Save"}
                            title={isSaving ? "Saving..." : "Save"}
                        >
                            <FaSave aria-hidden />
                        </button>
                    ) : (
                        <button
                            className="edit-btn icon-btn"
                            onClick={() => setIsEditing(true)}
                            aria-label="Edit"
                            title="Edit"
                        >
                            <FaRegEdit aria-hidden />
                        </button>
                    )}
                </div>
            </div>

            {error && <div className="note-error">{error}</div>}

            <div className="note-content">
                {isEditing ? (
                    <textarea
                        className="note-textarea"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Write your markdown here..."
                    />
                ) : (
                    <div className="note-preview markdown-body">
                        <ReactMarkdown>{note}</ReactMarkdown>
                    </div>
                )}
            </div>
        </div>
    );
}
