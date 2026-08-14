/**
 * Pure Markdown text analysis for the note editor.
 *
 * Nothing here touches the DOM or the filesystem: these are the string
 * functions the editor and the preview both reason about, kept apart from
 * rendering so the awkward cases (indentation, fenced code, headings) can be
 * followed in one place.
 */

/** Columns a tab advances, matching how a textarea renders one. */
const TAB_WIDTH = 4;

/** Opens or closes a fenced code block. Indentation before the fence is allowed. */
const FENCE = /^\s*(?:```|~~~)/;

/** A bullet or ordered list item, which owns the lines indented under it. */
const LIST_ITEM = /^\s*(?:[-*+]|\d{1,9}[.)])\s/;

/** A table row. Like a list, its following rows belong with it. */
const TABLE_ROW = /^\s*\|/;

/** An ATX heading: one to six `#` then a space. */
const ATX_HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;

/** A setext `===` underline, which makes the line above an h1. */
const SETEXT_H1 = /^ {0,3}=+\s*$/;

/** A setext `---` underline, which makes the line above an h2. */
const SETEXT_H2 = /^ {0,3}-+\s*$/;

/**
 * A run of lines that share one indentation depth.
 *
 * Markdown itself has no notion of "this paragraph is indented" — four or more
 * leading spaces mean a code block, and fewer are simply discarded. So the
 * preview measures indentation before parsing, strips it, and re-applies it as
 * layout. That keeps `Q:` / `A:` style notes looking the way they were typed
 * without the deeper indents turning into code.
 */
export interface IndentBlock {
    /** Indent depth in character widths. `0` for ordinary, flush-left text. */
    indent: number;
    /** The block's text with `indent` columns removed, ready to parse as Markdown. */
    text: string;
}

/** A heading the quick-navigation panel can jump to. */
export interface HeadingRef {
    /** 1 for `#`, 2 for `##`, and so on. */
    level: number;
    text: string;
    /** Zero-based line the heading starts on, for scrolling the editor. */
    line: number;
}

/** One occurrence of a search term, as offsets into the searched string. */
export interface TextMatch {
    start: number;
    end: number;
}

/** How many columns the leading whitespace of `line` occupies. */
function leadingWidth(line: string): number {
    let width = 0;
    for (const char of line) {
        if (char === " ") width += 1;
        else if (char === "\t") width += TAB_WIDTH - (width % TAB_WIDTH);
        else break;
    }
    return width;
}

/** `line` with up to `width` columns of leading whitespace removed. */
function stripWidth(line: string, width: number): string {
    let removed = 0;
    let index = 0;
    while (index < line.length && removed < width) {
        const char = line[index];
        if (char === " ") removed += 1;
        else if (char === "\t") removed += TAB_WIDTH - (removed % TAB_WIDTH);
        else break;
        index++;
    }
    return line.slice(index);
}

function isBlank(line: string): boolean {
    return line.trim() === "";
}

/** Index of the next line with content, or `-1` at the end of the note. */
function nextContentLine(lines: string[], from: number): number {
    for (let index = from; index < lines.length; index++) {
        if (!isBlank(lines[index])) return index;
    }
    return -1;
}

/**
 * Group `source` into runs of equally indented lines.
 *
 * A list or table item owns every line indented at least as far as itself, so
 * nested lists and multi-row tables keep parsing as one structure rather than
 * being cut apart. Anything else ends its block as soon as the indentation
 * changes, which is what turns an indented answer line into its own indented
 * paragraph.
 *
 * Blank lines separate blocks, except where the following line stays inside the
 * block that was already open.
 */
export function splitIndentBlocks(source: string): IndentBlock[] {
    const lines = source.split("\n");
    const blocks: IndentBlock[] = [];
    let index = 0;

    while (index < lines.length) {
        if (isBlank(lines[index])) {
            index++;
            continue;
        }

        const indent = leadingWidth(lines[index]);
        const start = index;
        // A list or table keeps everything indented under it; other blocks end
        // the moment the indent changes. Reassigned as the block grows, since a
        // block can start as prose and reach a list further down.
        let owning = LIST_ITEM.test(lines[index]) || TABLE_ROW.test(lines[index]);
        let inFence = FENCE.test(lines[index]);
        index++;

        while (index < lines.length) {
            const line = lines[index];

            // Code fences are opaque: their contents are whatever the user typed,
            // indentation included, so no line inside one ends the block.
            if (inFence) {
                if (FENCE.test(line)) inFence = false;
                index++;
                continue;
            }
            if (FENCE.test(line)) {
                inFence = true;
                index++;
                continue;
            }

            if (isBlank(line)) {
                const next = nextContentLine(lines, index);
                if (next === -1) break;
                const nextIndent = leadingWidth(lines[next]);
                if (owning ? nextIndent < indent : nextIndent !== indent) break;
                index++;
                continue;
            }

            const width = leadingWidth(line);
            if (owning ? width < indent : width !== indent) break;

            // Whether this block owns what follows is decided by its last line at
            // its own indent: a list that starts here keeps its nested items, and
            // prose after a list gives that up again.
            if (width === indent) owning = LIST_ITEM.test(line) || TABLE_ROW.test(line);
            index++;
        }

        blocks.push({
            indent,
            text: lines
                .slice(start, index)
                .map((line) => stripWidth(line, indent))
                .join("\n"),
        });
    }

    return blocks;
}

/**
 * Headings in `source`, in document order, down to `maxLevel`.
 *
 * Both heading styles are recognised, and fenced code is skipped so a `#`
 * comment in a shell snippet is not offered as a destination.
 */
export function parseHeadings(source: string, maxLevel = 3): HeadingRef[] {
    const lines = source.split("\n");
    const headings: HeadingRef[] = [];
    let inFence = false;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];

        if (FENCE.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence || isBlank(line)) continue;

        const atx = ATX_HEADING.exec(line);
        if (atx) {
            const level = atx[1].length;
            if (level <= maxLevel && atx[2] !== "") {
                headings.push({ level, text: atx[2], line: index });
            }
            continue;
        }

        // Setext: the underline on the next line is what makes this a heading.
        // A list item is excluded, since `- foo` under text is a list, not an h2.
        const under = lines[index + 1];
        if (under === undefined || LIST_ITEM.test(line)) continue;
        const level = SETEXT_H1.test(under) ? 1 : SETEXT_H2.test(under) ? 2 : 0;
        if (level !== 0 && level <= maxLevel) {
            headings.push({ level, text: line.trim(), line: index });
            index++;
        }
    }

    return headings;
}

/**
 * Every occurrence of `needle` in `haystack`, non-overlapping and left to right.
 *
 * An empty term matches nothing, so an empty find box does not report the whole
 * note as one long match.
 */
export function findMatches(
    haystack: string,
    needle: string,
    caseSensitive: boolean
): TextMatch[] {
    if (needle === "") return [];

    const subject = caseSensitive ? haystack : haystack.toLowerCase();
    const term = caseSensitive ? needle : needle.toLowerCase();
    const matches: TextMatch[] = [];

    let from = 0;
    for (;;) {
        const start = subject.indexOf(term, from);
        if (start === -1) break;
        matches.push({ start, end: start + term.length });
        from = start + term.length;
    }

    return matches;
}

/** Zero-based line `offset` falls on, for scrolling to a match in the editor. */
export function lineAtOffset(source: string, offset: number): number {
    let line = 0;
    for (let index = 0; index < offset && index < source.length; index++) {
        if (source[index] === "\n") line++;
    }
    return line;
}
