import { createContext, useContext } from "react";
import type { ThemeMode, ThemeSettings } from "./theme";

/**
 * Theme context and its hook, kept apart from `ThemeProvider` so that file
 * exports only a component and stays eligible for fast refresh.
 */

export interface ThemeContextValue {
    theme: ThemeSettings;
    setMode: (mode: ThemeMode) => void;
    setText: (textId: string) => void;
    setHighlight: (highlightId: string) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
    const context = useContext(ThemeContext);
    if (!context) throw new Error("useTheme must be used inside a ThemeProvider");
    return context;
}
