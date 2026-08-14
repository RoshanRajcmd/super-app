import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitIndentBlocks } from "../utils/markdown";
import {
    ACTIVE_MATCH_CLASS,
    MATCH_ATTRIBUTE,
    rehypeHighlight,
    type MatchCounter,
} from "../utils/markHighlight";
import { noteImage, type NoteSource } from "../utils/noteFile";

/**
 * Rendered view of a note.
 *
 * Three things here are not plain react-markdown:
 *
 * - GitHub Markdown is switched on, which is what makes tables, task lists and
 *   strikethrough render at all.
 * - The note is split into indentation blocks first, so typed-in indentation
 *   survives as layout instead of being dropped or read as a code block.
 * - Images and search highlighting are handled per element, since neither can
 *   work on the Markdown source alone.
 */

/** Static, so react-markdown does not re-run the pipeline for a new array. */
const REMARK_PLUGINS = [remarkGfm];

/** Matches links the webview can load by itself, with no disk access needed. */
const EXTERNAL_SRC = /^(?:https?:|data:|blob:)/i;

interface SearchTerm {
    query: string;
    caseSensitive: boolean;
}

interface NoteMarkdownProps {
    text: string;
    /** The note being shown, so relative image links can be resolved. */
    source: NoteSource;
    /** Term to highlight, or `null` when the find bar is closed. */
    search: SearchTerm | null;
    /** Index of the hit to bring into view and mark as current. */
    activeMatch: number;
    /** Reports how many hits the rendered output contains. */
    onMatchCount: (count: number) => void;
    /** The scrolling element, so the editor can drive it for quick navigation. */
    scrollRef: RefObject<HTMLDivElement | null>;
}

/**
 * An image a note links to.
 *
 * A relative link cannot be given to the browser directly: the preview is served
 * over the app's own protocol, so it would resolve against that and 404. The
 * bytes come from the Rust side instead, which looks beside the note for the
 * file. Absolute and inline sources are left alone.
 */
/** Outcome of a load, tagged with the link it was for. */
interface LoadedImage {
    src: string;
    /** Data URL of the bytes, or `null` if the load failed. */
    url: string | null;
    error: string | null;
}

function NoteImage({ source, src, alt }: { source: NoteSource; src?: string; alt?: string }) {
    const [loaded, setLoaded] = useState<LoadedImage | null>(null);
    const external = src !== undefined && EXTERNAL_SRC.test(src);

    useEffect(() => {
        if (src === undefined || external) return;

        let active = true;
        noteImage(source, src)
            .then((url) => {
                if (active) setLoaded({ src, url, error: null });
            })
            .catch((e) => {
                if (active) setLoaded({ src, url: null, error: String(e) });
            });

        return () => {
            active = false;
        };
    }, [source, src, external]);

    if (src === undefined) return null;
    if (external) return <img className="md-image" src={src} alt={alt ?? ""} />;

    const label = alt !== undefined && alt !== "" ? alt : src;

    // Results carry the link they were loaded for, so one left over from a
    // previous link is simply not used. Clearing it when `src` changes would mean
    // writing state from the effect for no gain.
    const current = loaded?.src === src ? loaded : null;

    if (current?.url != null) return <img className="md-image" src={current.url} alt={alt ?? ""} />;
    if (current?.error != null) {
        // Shown rather than hidden: a note whose image is missing should say so,
        // since the alternative is a silently blank spot in the writing.
        return (
            <span className="md-image-missing" title={current.error}>
                Image not found: {label}
            </span>
        );
    }
    return <span className="md-image-loading">Loading {label}…</span>;
}

export default function NoteMarkdown({
    text,
    source,
    search,
    activeMatch,
    onMatchCount,
    scrollRef,
}: NoteMarkdownProps) {
    const blocks = useMemo(() => splitIndentBlocks(text), [text]);

    const components = useMemo<Components>(
        () => ({
            // Wide tables scroll on their own rather than squeezing the columns
            // or pushing the whole page sideways.
            table: ({ children }) => (
                <div className="md-table-scroll">
                    <table>{children}</table>
                </div>
            ),
            img: ({ src, alt }) => (
                <NoteImage source={source} src={typeof src === "string" ? src : undefined} alt={alt} />
            ),
        }),
        [source]
    );

    /**
     * Hit numbering for this render.
     *
     * Deliberately a plain object created during render, not state or a ref: the
     * blocks below render in document order within this same pass, so they can
     * share it to number their hits continuously, and the next render starts
     * from zero again.
     */
    const counter: MatchCounter = { count: 0 };

    const query = search?.query ?? "";
    const caseSensitive = search?.caseSensitive ?? false;

    // The hits only exist once the tree is rendered, so they are counted from the
    // DOM rather than predicted from the source.
    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;
        onMatchCount(container.querySelectorAll(`[${MATCH_ATTRIBUTE}]`).length);
    }, [text, query, caseSensitive, onMatchCount, scrollRef]);

    // Mark the current hit and scroll it into view.
    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        const marks = container.querySelectorAll(`[${MATCH_ATTRIBUTE}]`);
        marks.forEach((mark) => mark.classList.remove(ACTIVE_MATCH_CLASS));

        const active = marks[activeMatch];
        if (!active) return;
        active.classList.add(ACTIVE_MATCH_CLASS);
        active.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [activeMatch, text, query, caseSensitive, scrollRef]);

    return (
        <div ref={scrollRef} className="note-preview markdown-body">
            {blocks.map((block, index) => (
                <div
                    // Index keys are stable enough here: the list is rebuilt from
                    // the text on every change and holds no state of its own.
                    key={index}
                    className={block.indent > 0 ? "md-indent" : undefined}
                    style={
                        block.indent > 0
                            ? ({ "--md-indent": `${block.indent}ch` } as CSSProperties)
                            : undefined
                    }
                >
                    <ReactMarkdown
                        remarkPlugins={REMARK_PLUGINS}
                        rehypePlugins={
                            query === ""
                                ? undefined
                                : [rehypeHighlight({ query, caseSensitive, counter })]
                        }
                        components={components}
                    >
                        {block.text}
                    </ReactMarkdown>
                </div>
            ))}
        </div>
    );
}
