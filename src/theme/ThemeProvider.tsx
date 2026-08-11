import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getStore } from "../utils/keyValueStore";
import { DEFAULT_THEME, themeVariables, type ThemeSettings } from "./theme";
import { ThemeContext, type ThemeContextValue } from "./themeContext";

/**
 * Applies the active theme to the document and persists the user's choice.
 *
 * Variables are written onto `:root` rather than passed down as props, so every
 * stylesheet in the app picks up a change without any component re-rendering.
 */

const THEME_KEY = "theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<ThemeSettings>(DEFAULT_THEME);

    // Load the saved theme once. Until it arrives the default is shown, which
    // avoids a flash of unstyled content.
    useEffect(() => {
        let active = true;

        getStore()
            .get<Partial<ThemeSettings>>(THEME_KEY)
            .then((saved) => {
                if (!active || !saved) return;
                setTheme({
                    mode: saved.mode === "dark" ? "dark" : DEFAULT_THEME.mode,
                    textId: saved.textId ?? DEFAULT_THEME.textId,
                    highlightId: saved.highlightId ?? DEFAULT_THEME.highlightId,
                });
            })
            .catch((error) => {
                console.error("Failed to load theme:", error);
            });

        return () => {
            active = false;
        };
    }, []);

    // Push the resolved variables onto the document root whenever they change.
    useEffect(() => {
        const root = document.documentElement;
        const variables = themeVariables(theme);
        for (const [name, value] of Object.entries(variables)) {
            root.style.setProperty(name, value);
        }
        // Lets CSS target the mode directly, and tells the browser to draw
        // native controls (checkboxes, date pickers, scrollbars) to match.
        root.dataset.theme = theme.mode;
        root.style.colorScheme = theme.mode;
    }, [theme]);

    const update = useCallback((changes: Partial<ThemeSettings>) => {
        setTheme((previous) => {
            const next = { ...previous, ...changes };
            // Fire-and-forget: a failed write only loses the preference, so it
            // should not block the UI from applying the change.
            getStore()
                .set(THEME_KEY, next)
                .catch((error) => console.error("Failed to save theme:", error));
            return next;
        });
    }, []);

    const value = useMemo<ThemeContextValue>(
        () => ({
            theme,
            setMode: (mode) => update({ mode }),
            setText: (textId) => update({ textId }),
            setHighlight: (highlightId) => update({ highlightId }),
        }),
        [theme, update]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
