/**
 * Which shell the app is running in, and the layout facts that follow from it.
 *
 * The web build and the desktop build can both trust `env(safe-area-inset-*)` to
 * tell them how much of the viewport the system covers. The Android WebView
 * cannot: it only started forwarding the status and navigation bar insets to CSS
 * in Chrome 136 — and then only for fullscreen WebViews — with the rest arriving
 * in 144, and several releases in between report a flat 0px. Meanwhile Android 15
 * draws every app edge-to-edge whether it asked to or not, so a layout that pads
 * itself by 0px ends up with its header under the status bar and its footer under
 * the navigation bar. That is the "the APK looks nothing like the dev build"
 * symptom.
 *
 * So the shell is recorded on the root element, and the stylesheet uses it to
 * pick a floor for the insets. `max()` keeps the real values when the WebView
 * does report them, and the floor applies only when it reports nothing.
 */

import { isTauri } from "./platform";

export type Shell = "browser" | "desktop" | "android" | "ios";

/**
 * Detected from the user agent rather than asked of the OS.
 *
 * `@tauri-apps/plugin-os` would answer this properly, but only after an async
 * round trip — and the answer is needed before first paint, or the app visibly
 * reflows. The WebView's user agent is decided by the platform's own engine, so
 * it is reliable enough for the one thing it is used for here.
 */
export function detectShell(): Shell {
    if (!isTauri()) return "browser";

    const agent = navigator.userAgent;
    if (/Android/i.test(agent)) return "android";
    if (/iPhone|iPad|iPod/i.test(agent)) return "ios";
    return "desktop";
}

/** Record the shell on `<html>` so CSS can branch on it. */
export function applyShell(): Shell {
    const shell = detectShell();
    document.documentElement.dataset.shell = shell;
    return shell;
}
