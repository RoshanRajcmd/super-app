/**
 * Shows on screen anything that would otherwise leave a blank app.
 *
 * A browser has a console; a packaged APK does not. When something throws before
 * React mounts — a missing asset, an API the WebView does not have — the only
 * symptom is a white screen, and diagnosing it means plugging in a cable and
 * reading `adb logcat`. This paints the message into the page instead.
 *
 * Written against the DOM directly, with no imports beyond this file: it has to
 * keep working in exactly the case where React never started.
 */

const OVERLAY_ID = "crash-overlay";

/** Append `message` to the overlay, creating it on the first failure. */
function report(message: string): void {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = OVERLAY_ID;
        overlay.className = "crash-overlay";

        const heading = document.createElement("strong");
        heading.textContent = "Something failed to start";
        overlay.appendChild(heading);

        document.body.appendChild(overlay);
    }

    const line = document.createElement("pre");
    line.className = "crash-overlay-message";
    line.textContent = message;
    overlay.appendChild(line);
}

/** Start listening. Safe to call more than once; only the first call registers. */
let installed = false;
export function installCrashOverlay(): void {
    if (installed) return;
    installed = true;

    window.addEventListener(
        "error",
        (event) => {
            // A failed <script>, <link> or <img> fires here too, with no Error
            // object but a target that names what could not be loaded. Those
            // events do not bubble, hence the capture phase.
            const target = event.target;
            if (target instanceof HTMLElement) {
                const url = target.getAttribute("src") ?? target.getAttribute("href") ?? "";
                report(`Failed to load ${target.tagName.toLowerCase()} ${url}`);
                return;
            }
            report(event.error instanceof Error ? errorText(event.error) : event.message);
        },
        true
    );

    window.addEventListener("unhandledrejection", (event) => {
        report(event.reason instanceof Error ? errorText(event.reason) : String(event.reason));
    });
}

/** Message plus stack, since on a phone the stack is the only clue available. */
export function errorText(error: Error): string {
    return error.stack !== undefined && error.stack !== ""
        ? error.stack
        : `${error.name}: ${error.message}`;
}
