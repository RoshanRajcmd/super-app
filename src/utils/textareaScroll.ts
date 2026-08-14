/**
 * Scrolling a textarea to a position in its text.
 *
 * A textarea exposes no geometry for its content, so there is no way to ask it
 * where a given character sits. The usual workaround is used here: lay the text
 * out in a hidden div styled to wrap exactly as the textarea does, and measure
 * how tall the part before the target renders.
 *
 * Focus is deliberately never taken. Moving the caret by focusing would pull the
 * keyboard up on a phone and steal the cursor out of the find box.
 */

/** Styles that decide where the text wraps, and so must match the textarea. */
const MIRROR_PROPERTIES = [
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-variant",
    "letter-spacing",
    "line-height",
    "text-transform",
    "text-indent",
    "word-spacing",
    "padding-left",
    "padding-right",
    "border-left-width",
    "border-right-width",
    "box-sizing",
    "tab-size",
    "word-break",
    "overflow-wrap",
] as const;

/** Height `text` would occupy inside `area`. */
function measureHeight(area: HTMLTextAreaElement, text: string): number {
    const computed = getComputedStyle(area);
    const mirror = document.createElement("div");

    for (const name of MIRROR_PROPERTIES) {
        mirror.style.setProperty(name, computed.getPropertyValue(name));
    }
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.top = "0";
    mirror.style.left = "-9999px";
    mirror.style.height = "auto";
    mirror.style.width = `${area.clientWidth}px`;
    mirror.style.whiteSpace = "pre-wrap";
    // A trailing newline contributes no height on its own, so anchor the end
    // with a zero-width space to keep the last line measurable.
    mirror.textContent = `${text}\u200b`;

    document.body.appendChild(mirror);
    const height = mirror.offsetHeight;
    mirror.remove();
    return height;
}

/** Character offset the zero-based `line` starts at. */
export function offsetOfLine(text: string, line: number): number {
    let offset = 0;
    for (let index = 0; index < line; index++) {
        const next = text.indexOf("\n", offset);
        if (next === -1) return offset;
        offset = next + 1;
    }
    return offset;
}

/**
 * Scroll `area` so the character at `offset` is visible.
 *
 * Placed a third of the way down rather than flush to the top, so there is some
 * context above whatever was jumped to.
 */
export function scrollTextareaToOffset(area: HTMLTextAreaElement, offset: number): void {
    const height = measureHeight(area, area.value.slice(0, offset));
    area.scrollTop = Math.max(0, height - area.clientHeight / 3);
}
