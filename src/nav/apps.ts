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
}

export const APPS: AppDefinition[] = [
    {
        id: "notes",
        label: "Note Editor",
        icon: "📝",
    },
    {
        id: "tasks",
        label: "Task Manager",
        icon: "✅",
    },
    {
        id: "habits",
        label: "Habit Tracker",
        icon: "🔥",
    },
];

/** The app shown when the app opens. */
export const DEFAULT_APP: AppId = "notes";

export function appById(id: AppId): AppDefinition {
    // Every AppId has an entry, so the fallback is only for a corrupt saved value.
    return APPS.find((a) => a.id === id) ?? APPS[0];
}
