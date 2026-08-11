import { useEffect } from "react";
import { GoSidebarExpand } from "react-icons/go";
import { APPS } from "../nav/apps";
import { useNav } from "../nav/navContext";
import "../styles/SidePanel.css";

/**
 * The app switcher, sliding in from the left over whatever screen is showing.
 *
 * Rendered only while open, so the panel's contents stay out of the tab order
 * when it is shut.
 */
export default function SidePanel() {
    const { currentApp, goToApp, closeSidebar, openThemeSettings } = useNav();

    // Escape closes, as it does for the theme dialog. Bound on the document so it
    // works wherever focus happens to be when the panel opens.
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") closeSidebar();
        }

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [closeSidebar]);

    return (
        <div
            className="side-panel-overlay"
            onClick={(e) => {
                if (e.target === e.currentTarget) closeSidebar();
            }}
        >
            <aside className="side-panel" aria-label="Apps">
                <div className="side-panel-head">
                    <span className="side-panel-title">SuperApp</span>
                    <button
                        className="side-panel-close icon-btn"
                        onClick={closeSidebar}
                        aria-label="Close app menu"
                        title="Close"
                    >
                        <GoSidebarExpand aria-hidden />
                    </button>
                </div>

                <nav className="side-panel-apps">
                    {APPS.map((app) => (
                        <button
                            key={app.id}
                            className={`side-panel-app ${app.id === currentApp ? "active" : ""}`}
                            onClick={() => goToApp(app.id)}
                            aria-current={app.id === currentApp ? "page" : undefined}
                        >
                            <span className="side-panel-app-icon" aria-hidden>
                                {app.icon}
                            </span>
                            <span className="side-panel-app-text">
                                <span className="side-panel-app-label">{app.label}</span>
                                <span className="side-panel-app-tagline">{app.tagline}</span>
                            </span>
                        </button>
                    ))}
                </nav>

                <div className="side-panel-foot">
                    <button className="side-panel-settings" onClick={openThemeSettings}>
                        <span aria-hidden>⚙</span> Appearance
                    </button>
                </div>
            </aside>
        </div>
    );
}
