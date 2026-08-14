import { useState } from "react";
import { IoClose } from "react-icons/io5";

/**
 * Quick navigation between a note's headings.
 *
 * Shown as a slim handle down the right edge, the way a phone reader's scrubber
 * is: tapping it opens a panel of the note's headings, and tapping one jumps
 * there. The handle's ticks are drawn from the headings themselves, so a long
 * note reads as a denser strip than a short one.
 *
 * The component only reports which heading was chosen. Whether that means
 * scrolling the preview or the textarea is the editor's business, since the two
 * have nothing in common mechanically.
 */

/** A heading as the panel lists it. */
export interface TocEntry {
    /** 1, 2 or 3. Deeper headings are not offered — this is for orientation. */
    level: number;
    text: string;
}

interface NoteTocProps {
    entries: TocEntry[];
    /** Index into `entries` of the heading to go to. */
    onSelect: (index: number) => void;
}

/** Ticks drawn on the handle. Past this the strip stops reading as a scrubber. */
const MAX_TICKS = 14;

export default function NoteToc({ entries, onSelect }: NoteTocProps) {
    const [open, setOpen] = useState(false);

    // Nothing to navigate: a note with no headings gets no handle, rather than a
    // control that opens an empty panel.
    if (entries.length === 0) return null;

    return (
        <>
            {!open && (
                <button
                    className="note-toc-handle"
                    onClick={() => setOpen(true)}
                    aria-label="Jump to a heading"
                    aria-expanded={false}
                    title="Jump to a heading"
                >
                    <span className="note-toc-ticks" aria-hidden>
                        {entries.slice(0, MAX_TICKS).map((entry, index) => (
                            <span key={index} className={`note-toc-tick level-${entry.level}`} />
                        ))}
                    </span>
                </button>
            )}

            {open && (
                <div
                    className="note-toc-scrim"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) setOpen(false);
                    }}
                >
                    <nav className="note-toc-panel" aria-label="Headings">
                        <div className="note-toc-head">
                            <h2>Headings</h2>
                            <button
                                className="note-toc-close icon-btn"
                                onClick={() => setOpen(false)}
                                aria-label="Close"
                                title="Close"
                            >
                                <IoClose aria-hidden />
                            </button>
                        </div>

                        <ul className="note-toc-list">
                            {entries.map((entry, index) => (
                                <li key={index}>
                                    <button
                                        className={`note-toc-item level-${entry.level}`}
                                        onClick={() => {
                                            onSelect(index);
                                            setOpen(false);
                                        }}
                                    >
                                        {entry.text}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>
            )}
        </>
    );
}
