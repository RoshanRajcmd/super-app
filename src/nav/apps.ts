/**
 * The sub-apps the shell can show.
 *
 * One registry, consumed by both the side panel and the home pages, so adding an
 * app is a single edit and its name cannot drift between the two.
 */

export type AppId = "notes" | "tasks" | "habits";

export interface AppDefinition {
    id: AppId;
    /** Name in the side panel and on the app's home page. */
    label: string;
    /** Emoji marker, matching the icons the screens already use. */
    icon: string;
    /** One line under the home page title. */
    tagline: string;
}

export const APPS: AppDefinition[] = [
    {
        id: "notes",
        label: "Note Editor",
        icon: "📝",
        tagline: "Write and preview markdown notes",
    },
    {
        id: "tasks",
        label: "Task Manager",
        icon: "✓",
        tagline: "Track what needs doing, and how it is going",
    },
    {
        id: "habits",
        label: "Habit Tracker",
        icon: "🔥",
        tagline: "Keep your daily routine on the board",
    },
];

/** The app shown when the app opens. */
export const DEFAULT_APP: AppId = "notes";

export function appById(id: AppId): AppDefinition {
    // Every AppId has an entry, so the fallback is only for a corrupt saved value.
    return APPS.find((a) => a.id === id) ?? APPS[0];
}
