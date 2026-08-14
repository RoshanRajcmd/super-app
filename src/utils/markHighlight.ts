/**
 * Rehype plugin that wraps search hits in the rendered preview.
 *
 * The preview is generated HTML, so a match cannot be highlighted by touching
 * the Markdown source — the source contains syntax the reader never sees, and
 * offsets into it do not line up with what is on screen. Instead this runs over
 * the output tree and splits text nodes around each hit, which is also what
 * makes the hits addressable: every `<mark>` carries its index, so the editor
 * can scroll to one by number.
 *
 * The node types are declared locally rather than imported from `hast`, which is
 * only present as a transitive dependency of react-markdown.
 */

import { findMatches } from "./markdown";

interface HastNode {
    type: string;
    tagName?: string;
    value?: string;
    properties?: Record<string, unknown>;
    children?: HastNode[];
}

/** Class on every hit, and on the one currently stepped to. */
export const MATCH_CLASS = "note-match";
export const ACTIVE_MATCH_CLASS = "note-match-active";

/** Attribute holding a hit's index, so it can be found in the DOM by number. */
export const MATCH_ATTRIBUTE = "data-note-match";

/**
 * Running count of hits across one render.
 *
 * The preview is rendered as several Markdown roots (one per indentation
 * block), so the numbering has to be handed between them to stay continuous.
 */
export interface MatchCounter {
    count: number;
}

export interface HighlightOptions {
    query: string;
    caseSensitive: boolean;
    counter: MatchCounter;
}

function markNode(value: string, index: number): HastNode {
    return {
        type: "element",
        tagName: "mark",
        properties: { className: [MATCH_CLASS], [MATCH_ATTRIBUTE]: String(index) },
        children: [{ type: "text", value }],
    };
}

/** Split one text node into plain text and `<mark>` runs. Returns `null` if it has no hits. */
function splitText(node: HastNode, options: HighlightOptions): HastNode[] | null {
    const value = node.value ?? "";
    const matches = findMatches(value, options.query, options.caseSensitive);
    if (matches.length === 0) return null;

    const parts: HastNode[] = [];
    let cursor = 0;
    for (const match of matches) {
        if (match.start > cursor) {
            parts.push({ type: "text", value: value.slice(cursor, match.start) });
        }
        parts.push(markNode(value.slice(match.start, match.end), options.counter.count));
        options.counter.count++;
        cursor = match.end;
    }
    if (cursor < value.length) {
        parts.push({ type: "text", value: value.slice(cursor) });
    }

    return parts;
}

function transform(node: HastNode, options: HighlightOptions): void {
    if (!node.children) return;

    const next: HastNode[] = [];
    for (const child of node.children) {
        if (child.type === "text") {
            const split = splitText(child, options);
            if (split) next.push(...split);
            else next.push(child);
            continue;
        }
        transform(child, options);
        next.push(child);
    }
    node.children = next;
}

/**
 * Build the plugin for one search term.
 *
 * A new plugin is made per render because the term and the shared counter both
 * change; the plugin itself holds no state of its own.
 */
export function rehypeHighlight(options: HighlightOptions) {
    return () => (tree: HastNode) => {
        if (options.query === "") return;
        transform(tree, options);
    };
}
