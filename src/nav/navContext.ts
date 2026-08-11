import { createContext, useContext } from "react";
import type { AppId } from "./apps";

/**
 * Navigation context and its hook, kept apart from the shell component so that
 * file exports only a component and stays eligible for fast refresh.
 *
 * Two axes: which sub-app is active, and whether we are on its home page or in
 * the app itself. The side panel is orthogonal to both — it opens over whatever
 * is showing, from every screen.
 */

export interface NavContextValue {
    currentApp: AppId;
    /** `home` shows the app's home page; `detail` shows the app itself. */
    screen: "home" | "detail";
    /** Switch app, landing on its home page. Closes the side panel. */
    goToApp: (id: AppId) => void;
    /** Enter the current app from its home page. */
    openDetail: () => void;
    /** Return to the current app's home page. */
    goHome: () => void;
    sidebarOpen: boolean;
    openSidebar: () => void;
    closeSidebar: () => void;
    /** Theme settings live in the side panel, so the shell owns the dialog. */
    openThemeSettings: () => void;
}

export const NavContext = createContext<NavContextValue | null>(null);

export function useNav(): NavContextValue {
    const context = useContext(NavContext);
    if (!context) throw new Error("useNav must be used inside the app shell");
    return context;
}
