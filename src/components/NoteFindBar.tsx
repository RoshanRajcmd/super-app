import { useEffect, useRef } from "react";
import { IoChevronDown, IoChevronUp, IoClose } from "react-icons/io5";

/**
 * Find, and — while editing — replace.
 *
 * One bar serves both modes so the control does not move when the user switches.
 * Replace is folded away behind a disclosure rather than shown alongside find:
 * on a phone the two fields plus their buttons do not fit on one row, and
 * replacing is the rarer job.
 */

interface ReplaceControls {
    open: boolean;
    onToggle: () => void;
    value: string;
    onValueChange: (value: string) => void;
    /** Replace the hit currently stepped to. */
    onReplace: () => void;
    onReplaceAll: () => void;
}

interface NoteFindBarProps {
    query: string;
    onQueryChange: (query: string) => void;
    caseSensitive: boolean;
    onCaseSensitiveChange: (caseSensitive: boolean) => void;
    matchCount: number;
    /** Zero-based index of the hit being shown, displayed one-based. */
    activeMatch: number;
    onPrevious: () => void;
    onNext: () => void;
    onClose: () => void;
    /** `null` in preview mode, where there is nothing to write back to. */
    replace: ReplaceControls | null;
}

export default function NoteFindBar({
    query,
    onQueryChange,
    caseSensitive,
    onCaseSensitiveChange,
    matchCount,
    activeMatch,
    onPrevious,
    onNext,
    onClose,
    replace,
}: NoteFindBarProps) {
    const input = useRef<HTMLInputElement>(null);

    // Opening the bar should leave the user typing, not hunting for the field.
    useEffect(() => {
        input.current?.focus();
    }, []);

    return (
        <div className="note-find">
            <div className="note-find-row">
                <input
                    ref={input}
                    className="note-find-input"
                    type="search"
                    value={query}
                    placeholder="Find in note"
                    aria-label="Find in note"
                    onChange={(event) => onQueryChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        if (event.shiftKey) onPrevious();
                        else onNext();
                    }}
                />

                <button
                    className={`note-find-case${caseSensitive ? " active" : ""}`}
                    onClick={() => onCaseSensitiveChange(!caseSensitive)}
                    aria-pressed={caseSensitive}
                    aria-label="Match case"
                    title="Match case"
                >
                    Aa
                </button>

                <span className="note-find-count">
                    {query === ""
                        ? ""
                        : matchCount === 0
                          ? "No results"
                          : `${activeMatch + 1}/${matchCount}`}
                </span>

                <button
                    className="note-find-step icon-btn"
                    onClick={onPrevious}
                    disabled={matchCount === 0}
                    aria-label="Previous match"
                    title="Previous match"
                >
                    <IoChevronUp aria-hidden />
                </button>
                <button
                    className="note-find-step icon-btn"
                    onClick={onNext}
                    disabled={matchCount === 0}
                    aria-label="Next match"
                    title="Next match"
                >
                    <IoChevronDown aria-hidden />
                </button>

                {replace && (
                    <button
                        className={`note-find-toggle${replace.open ? " active" : ""}`}
                        onClick={replace.onToggle}
                        aria-expanded={replace.open}
                        aria-label={replace.open ? "Hide replace" : "Show replace"}
                        title={replace.open ? "Hide replace" : "Show replace"}
                    >
                        {replace.open ? "Find" : "Replace"}
                        <IoChevronDown aria-hidden />
                    </button>
                )}

                <button
                    className="note-find-close icon-btn"
                    onClick={onClose}
                    aria-label="Close find"
                    title="Close find"
                >
                    <IoClose aria-hidden />
                </button>
            </div>

            {replace?.open && (
                <div className="note-find-row">
                    <input
                        className="note-find-input"
                        type="text"
                        value={replace.value}
                        placeholder="Replace with"
                        aria-label="Replace with"
                        onChange={(event) => replace.onValueChange(event.target.value)}
                    />
                    <button
                        className="note-find-action"
                        onClick={replace.onReplace}
                        disabled={matchCount === 0}
                    >
                        Replace
                    </button>
                    <button
                        className="note-find-action"
                        onClick={replace.onReplaceAll}
                        disabled={matchCount === 0}
                    >
                        All
                    </button>
                </div>
            )}
        </div>
    );
}
