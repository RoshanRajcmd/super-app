import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import "./styles/NoteEditor.css";

interface NoteEditorProps {
    onBack: () => void;
}

export default function NoteEditor({ onBack }: NoteEditorProps) {
    const [note, setNote] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const NOTE_PATH = "./data/note.md";

    useEffect(() => {
        loadNote();
    }, []);

    async function loadNote() {
        try {
            const content = await invoke<string>("read_file", { path: NOTE_PATH });
            setNote(content);
        } catch (error) {
            console.error("Failed to load note:", error);
            setNote("# New Note\n\nStart writing...");
        }
    }

    async function saveNote() {
        setIsSaving(true);
        try {
            await invoke("write_file", {
                path: NOTE_PATH,
                content: note,
            });
            setIsEditing(false);
            console.log("Note saved successfully");
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
                                onClick={saveNote}
                                disabled={isSaving}
                            >
                                {isSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                                className="cancel-btn"
                                onClick={() => {
                                    setIsEditing(false);
                                    loadNote();
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
