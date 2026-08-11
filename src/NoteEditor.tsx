import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { FaSave, FaRegEdit } from "react-icons/fa";
import { IoChevronBackCircle } from "react-icons/io5";
import { loadNote, saveNote } from "./utils/storage";
import "./styles/NoteEditor.css";

interface NoteEditorProps {
    onBack: () => void;
}

const FALLBACK_NOTE = "# New Note\n\nStart writing...";

export default function NoteEditor({ onBack }: NoteEditorProps) {
    const [note, setNote] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Hydrate from the persistent store once on mount.
    useEffect(() => {
        let active = true;

        loadNote()
            .then((content) => {
                if (active) setNote(content);
            })
            .catch((error) => {
                console.error("Failed to load note:", error);
                if (active) setNote(FALLBACK_NOTE);
            });

        return () => {
            active = false;
        };
    }, []);

    /** Persist the note. Returns false if the write failed, so callers can stay put. */
    async function persist(): Promise<boolean> {
        setIsSaving(true);
        try {
            await saveNote(note);
            return true;
        } catch (error) {
            console.error("Failed to save note:", error);
            alert("Failed to save note");
            return false;
        } finally {
            setIsSaving(false);
        }
    }

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

    return (
        <div className="note-editor">
            <div className="note-header">
                <button
                    className="back-btn icon-btn"
                    onClick={handleBack}
                    disabled={isSaving}
                    aria-label="Back"
                    title="Back (saves)"
                >
                    <IoChevronBackCircle aria-hidden />
                </button>
                <h1>📝 Note Editor</h1>
                <div className="note-actions">
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
