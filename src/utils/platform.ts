/**
 * Runtime platform detection.
 *
 * Tauri v2 injects `__TAURI_INTERNALS__` into the webview on every target
 * (macOS, Windows, Linux, Android, iOS). A plain browser tab does not have it,
 * so this is the single switch that decides which storage backend to use.
 */

interface TauriWindow {
    __TAURI_INTERNALS__?: unknown;
}

export function isTauri(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof (window as TauriWindow).__TAURI_INTERNALS__ !== "undefined"
    );
}
