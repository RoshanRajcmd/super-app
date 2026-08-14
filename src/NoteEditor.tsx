import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaSave, FaRegEdit } from "react-icons/fa";
import { FiSearch } from "react-icons/fi";
import { IoChevronBackCircle } from "react-icons/io5";
import SidebarButton from "./components/SidebarButton";
import NoteFindBar from "./components/NoteFindBar";
import NoteMarkdown from "./components/NoteMarkdown";
import NoteToc, { type TocEntry } from "./components/NoteToc";
import { findMatches, parseHeadings } from "./utils/markdown";
import { offsetOfLine, scrollTextareaToOffset } from "./utils/textareaScroll";
import {
    clearNoteImageCache,
    NoteConflictError,
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

/** Deepest heading the quick-navigation panel offers. */
const TOC_DEPTH = 3;

/** Headings in the rendered preview, in the order they appear. */
const PREVIEW_HEADINGS = "h1, h2, h3";

export default function NoteEditor({ source, onBack }: NoteEditorProps) {
    const [note, setNote] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /** Find, and replace when editing. */
    const [findOpen, setFindOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [activeMatch, setActiveMatch] = useState(0);
    const [replaceOpen, setReplaceOpen] = useState(false);
    const [replaceValue, setReplaceValue] = useState("");

    /**
     * Hits in the preview, counted from the rendered output.
     *
     * The preview cannot be searched through the Markdown source: the source
     * holds syntax the reader never sees, so its hit count and offsets are not
     * the ones on screen. While editing, the textarea's text *is* the source, so
     * that mode counts hits directly instead.
     */
    const [previewMatchCount, setPreviewMatchCount] = useState(0);

    /** Headings in the preview, likewise read back from the rendered output. */
    const [previewHeadings, setPreviewHeadings] = useState<TocEntry[]>([]);

    const previewRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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

        // Another note's images are no longer wanted, and dropping them is also
        // what picks up an image file that has been replaced on disk.
        clearNoteImageCache();

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

    /** Headings while editing, which are read from the text the user is typing. */
    const editHeadings = useMemo(() => parseHeadings(note, TOC_DEPTH), [note]);

    /** Hits while editing, as offsets into the note text. */
    const editMatches = useMemo(
        () => (isEditing && findOpen ? findMatches(note, query, caseSensitive) : []),
        [isEditing, findOpen, note, query, caseSensitive]
    );

    const matchCount = isEditing ? editMatches.length : previewMatchCount;
    const tocEntries = isEditing
        ? editHeadings.map((heading) => ({ level: heading.level, text: heading.text }))
        : previewHeadings;

    const handleMatchCount = useCallback((count: number) => setPreviewMatchCount(count), []);

    // A changed term means starting from the first hit again.
    useEffect(() => {
        setActiveMatch(0);
    }, [query, caseSensitive, isEditing]);

    // Editing the note can remove the hit being stepped through.
    useEffect(() => {
        if (activeMatch >= matchCount) setActiveMatch(matchCount === 0 ? 0 : matchCount - 1);
    }, [activeMatch, matchCount]);

    // Bring the current hit into view while editing. The preview does its own,
    // since there it is a rendered element rather than an offset.
    useEffect(() => {
        if (!isEditing) return;
        const area = textareaRef.current;
        const match = editMatches[activeMatch];
        if (!area || !match) return;

        // Selected but not focused: focusing would raise the phone keyboard and
        // take the cursor out of the find box.
        area.setSelectionRange(match.start, match.end);
        scrollTextareaToOffset(area, match.start);
    }, [activeMatch, editMatches, isEditing]);

    // Read the preview's headings back out of the DOM. Parsing the source for
    // them would risk a list that does not line up with what was rendered, and
    // the panel scrolls to elements by position.
    useEffect(() => {
        if (isEditing) return;

        const container = previewRef.current;
        if (!container) {
            setPreviewHeadings([]);
            return;
        }

        setPreviewHeadings(
            Array.from(container.querySelectorAll(PREVIEW_HEADINGS)).map((node) => ({
                level: Number(node.tagName.slice(1)),
                text: node.textContent ?? "",
            }))
        );
    }, [note, isEditing]);

    function stepMatch(by: number) {
        if (matchCount === 0) return;
        setActiveMatch((current) => (current + by + matchCount) % matchCount);
    }

    function handleTocSelect(index: number) {
        if (isEditing) {
            const heading = editHeadings[index];
            const area = textareaRef.current;
            if (!heading || !area) return;
            scrollTextareaToOffset(area, offsetOfLine(note, heading.line));
            return;
        }

        const node = previewRef.current?.querySelectorAll(PREVIEW_HEADINGS)[index];
        node?.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    /** Replace the hit currently stepped to. Editing only. */
    function handleReplace() {
        const match = editMatches[activeMatch];
        if (!match) return;
        setNote(note.slice(0, match.start) + replaceValue + note.slice(match.end));
        // The index is left alone: whatever followed slides into this position,
        // so stepping stays where the user was working.
    }

    function handleReplaceAll() {
        if (editMatches.length === 0) return;

        let out = "";
        let cursor = 0;
        for (const match of editMatches) {
            out += note.slice(cursor, match.start) + replaceValue;
            cursor = match.end;
        }
        setNote(out + note.slice(cursor));
        setActiveMatch(0);
    }

    function closeFind() {
        setFindOpen(false);
        setQuery("");
        setReplaceOpen(false);
        setActiveMatch(0);
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
                <h1 title={source.kind === "file" ? source.path : title}>{title}</h1>
                <div className="note-actions">
                    <button
                        className={`find-btn icon-btn${findOpen ? " active" : ""}`}
                        onClick={() => (findOpen ? closeFind() : setFindOpen(true))}
                        aria-label="Find in note"
                        aria-pressed={findOpen}
                        title="Find in note"
                    >
                        <FiSearch aria-hidden />
                    </button>
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

            {findOpen && (
                <NoteFindBar
                    query={query}
                    onQueryChange={setQuery}
                    caseSensitive={caseSensitive}
                    onCaseSensitiveChange={setCaseSensitive}
                    matchCount={matchCount}
                    activeMatch={activeMatch}
                    onPrevious={() => stepMatch(-1)}
                    onNext={() => stepMatch(1)}
                    onClose={closeFind}
                    replace={
                        isEditing
                            ? {
                                  open: replaceOpen,
                                  onToggle: () => setReplaceOpen(!replaceOpen),
                                  value: replaceValue,
                                  onValueChange: setReplaceValue,
                                  onReplace: handleReplace,
                                  onReplaceAll: handleReplaceAll,
                              }
                            : null
                    }
                />
            )}

            {error && <div className="note-error">{error}</div>}

            <div className="note-content">
                {isEditing ? (
                    <textarea
                        ref={textareaRef}
                        className="note-textarea"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Write your markdown here..."
                    />
                ) : (
                    <NoteMarkdown
                        text={note}
                        source={source}
                        search={findOpen ? { query, caseSensitive } : null}
                        activeMatch={activeMatch}
                        onMatchCount={handleMatchCount}
                        scrollRef={previewRef}
                    />
                )}

                <NoteToc entries={tocEntries} onSelect={handleTocSelect} />
            </div>
        </div>
    );
}
