import { isTauri } from "./platform";

/**
 * Platform-agnostic key/value persistence.
 *
 * - Tauri (desktop + Android + iOS): `@tauri-apps/plugin-store`, which writes to
 *   the OS app-data directory. Works on mobile, where there is no writable CWD.
 * - Browser: `localStorage`, with an in-memory fallback for private-mode or
 *   quota failures so the UI keeps working for the session.
 */

export interface KeyValueStore {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
}

const STORE_FILE = "superapp.json";
const BROWSER_PREFIX = "superapp:";

class TauriStore implements KeyValueStore {
    private store: Promise<import("@tauri-apps/plugin-store").Store> | null = null;

    private load() {
        if (!this.store) {
            this.store = import("@tauri-apps/plugin-store").then(({ load }) =>
                load(STORE_FILE, { autoSave: true })
            );
        }
        return this.store;
    }

    async get<T>(key: string): Promise<T | null> {
        const store = await this.load();
        const value = await store.get<T>(key);
        return value ?? null;
    }

    async set<T>(key: string, value: T): Promise<void> {
        const store = await this.load();
        await store.set(key, value);
        await store.save();
    }
}

class BrowserStore implements KeyValueStore {
    private memory = new Map<string, string>();

    private read(key: string): string | null {
        try {
            return localStorage.getItem(key);
        } catch {
            return this.memory.get(key) ?? null;
        }
    }

    private write(key: string, raw: string): void {
        try {
            localStorage.setItem(key, raw);
        } catch {
            // Private browsing or quota exceeded: keep data for this session only.
            this.memory.set(key, raw);
        }
    }

    async get<T>(key: string): Promise<T | null> {
        const raw = this.read(BROWSER_PREFIX + key);
        if (raw === null) return null;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return null;
        }
    }

    async set<T>(key: string, value: T): Promise<void> {
        this.write(BROWSER_PREFIX + key, JSON.stringify(value));
    }
}

let instance: KeyValueStore | null = null;

export function getStore(): KeyValueStore {
    if (!instance) {
        instance = isTauri() ? new TauriStore() : new BrowserStore();
    }
    return instance;
}
