/**
 * Theme model.
 *
 * A theme is three user-facing choices — background mode, text colour and
 * highlight colour — which expand into the CSS custom properties the whole app
 * already styles against. Keeping the choices this small means the settings
 * panel stays understandable and every screen changes together.
 */

export type ThemeMode = "light" | "dark";

/** A named text colour, resolved per mode so it stays readable in both. */
export interface TextOption {
    id: string;
    label: string;
    light: string;
    dark: string;
    /** Muted variant for secondary text. */
    lightSecondary: string;
    darkSecondary: string;
}

/** A named highlight colour, used for accents, active states and progress. */
export interface HighlightOption {
    id: string;
    label: string;
    /** Base accent. */
    color: string;
    /** Darker shade for hover/pressed states. */
    strong: string;
}

export interface ThemeSettings {
    mode: ThemeMode;
    textId: string;
    highlightId: string;
}

export const TEXT_OPTIONS: TextOption[] = [
    {
        id: "neutral",
        label: "Neutral",
        light: "#212529",
        dark: "#e6e8eb",
        lightSecondary: "#6c757d",
        darkSecondary: "#9aa4b2",
    },
    {
        id: "slate",
        label: "Slate",
        light: "#1e293b",
        dark: "#cbd5e1",
        lightSecondary: "#64748b",
        darkSecondary: "#94a3b8",
    },
    {
        id: "warm",
        label: "Warm",
        light: "#3f3227",
        dark: "#ede0d4",
        lightSecondary: "#8a7968",
        darkSecondary: "#b8a690",
    },
    {
        id: "contrast",
        label: "High contrast",
        light: "#000000",
        dark: "#ffffff",
        lightSecondary: "#444444",
        darkSecondary: "#c9c9c9",
    },
];

export const HIGHLIGHT_OPTIONS: HighlightOption[] = [
    { id: "blue", label: "Blue", color: "#007bff", strong: "#0062cc" },
    { id: "violet", label: "Violet", color: "#7c5cff", strong: "#6244d8" },
    { id: "teal", label: "Teal", color: "#0d9488", strong: "#0b7268" },
    { id: "amber", label: "Amber", color: "#d97706", strong: "#b45309" },
    { id: "rose", label: "Rose", color: "#e11d48", strong: "#be123c" },
];

export const DEFAULT_THEME: ThemeSettings = {
    mode: "light",
    textId: "neutral",
    highlightId: "blue",
};

/** Surface colours per mode. Not user-selectable; they follow the mode. */
const SURFACES = {
    light: {
        bg: "#f5f7fa",
        surface: "#ffffff",
        surfaceRaised: "#ffffff",
        border: "#e9ecef",
        shadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        errorBg: "#f8d7da",
        errorText: "#842029",
        errorBorder: "#f5c2c7",
        warnBg: "#fff3cd",
        warnText: "#664d03",
        warnBorder: "#ffecb5",
        doneBg: "#f2fbf4",
    },
    dark: {
        bg: "#14171c",
        surface: "#1c2027",
        surfaceRaised: "#232833",
        border: "#2e3440",
        shadow: "0 2px 8px rgba(0, 0, 0, 0.45)",
        errorBg: "#3b1c22",
        errorText: "#f5b5bd",
        errorBorder: "#5c2a33",
        warnBg: "#3a2f13",
        warnText: "#f2d98a",
        warnBorder: "#5a4a20",
        doneBg: "#16261c",
    },
} as const;

/** Heat scale for the commit graph, tuned per mode so level 1 stays visible. */
const HEAT = {
    light: ["#e9ecef", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    dark: ["#2e3440", "#1c4429", "#22703b", "#2ea043", "#57d364"],
} as const;

export function resolveText(settings: ThemeSettings): TextOption {
    return TEXT_OPTIONS.find((t) => t.id === settings.textId) ?? TEXT_OPTIONS[0];
}

export function resolveHighlight(settings: ThemeSettings): HighlightOption {
    return HIGHLIGHT_OPTIONS.find((h) => h.id === settings.highlightId) ?? HIGHLIGHT_OPTIONS[0];
}

/**
 * Expand a theme into the CSS custom properties the stylesheets consume.
 *
 * Returned as a plain map so the caller can write it onto the document root;
 * doing it in CSS variables means no component needs to know about theming.
 */
export function themeVariables(settings: ThemeSettings): Record<string, string> {
    const text = resolveText(settings);
    const highlight = resolveHighlight(settings);
    const surface = SURFACES[settings.mode];
    const heat = HEAT[settings.mode];
    const isDark = settings.mode === "dark";

    return {
        "--color-primary": highlight.color,
        "--color-primary-strong": highlight.strong,
        // Tint used behind selected cells and rows.
        "--color-primary-soft": isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)",
        "--color-success": isDark ? "#3fb950" : "#28a745",
        "--color-warning": isDark ? "#d29922" : "#ffc107",
        "--color-danger": isDark ? "#f85149" : "#dc3545",
        "--color-bg": surface.bg,
        "--color-surface": surface.surface,
        "--color-surface-raised": surface.surfaceRaised,
        "--color-border": surface.border,
        "--color-text": isDark ? text.dark : text.light,
        "--color-text-secondary": isDark ? text.darkSecondary : text.lightSecondary,
        "--color-error-bg": surface.errorBg,
        "--color-error-text": surface.errorText,
        "--color-error-border": surface.errorBorder,
        "--color-warn-bg": surface.warnBg,
        "--color-warn-text": surface.warnText,
        "--color-warn-border": surface.warnBorder,
        "--color-done-bg": surface.doneBg,
        /* Fill colour of the habit progress bars, at any percentage. */
        "--color-progress": "#5dd957",
        "--heat-0": heat[0],
        "--heat-1": heat[1],
        "--heat-2": heat[2],
        "--heat-3": heat[3],
        "--heat-4": heat[4],
        "--shadow": surface.shadow,
        "--radius": "8px",
    };
}
