import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
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

    // Discard local edits and re-read the stored note. Also used by Cancel.
    const refreshNote = useCallback(
        () =>
            loadNote()
                .then(setNote)
                .catch((error) => {
                    console.error("Failed to load note:", error);
                    setNote(FALLBACK_NOTE);
                }),
        []
    );

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

    async function handleSave() {
        setIsSaving(true);
        try {
            await saveNote(note);
            setIsEditing(false);
        } catch (error) {
            console.error("Failed to save note:", error);
            alert("Failed to save note");
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="note-editor">
            <div className="note-header">
                <button className="back-btn" onClick={onBack}>
                    ← Back
                </button>
                <h1>📝 Note Editor</h1>
                <div className="note-actions">
                    {isEditing ? (
                        <>
                            <button
                                className="save-btn"
                                onClick={handleSave}
                                disabled={isSaving}
                            >
                                {isSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                                className="cancel-btn"
                                onClick={() => {
                                    setIsEditing(false);
                                    refreshNote();
                                }}
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button
                            className="edit-btn"
                            onClick={() => setIsEditing(true)}
                        >
                            Edit
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
