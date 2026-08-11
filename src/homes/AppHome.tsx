import type { ReactNode } from "react";
import SidebarButton from "../components/SidebarButton";
import type { AppDefinition } from "../nav/apps";
import "../styles/Home.css";

interface AppHomeProps {
    app: AppDefinition;
    /** The app's primary way in, shown under the title. */
    actions?: ReactNode;
    /** Whatever this app puts on its home page: progress, recents, heatmaps. */
    children?: ReactNode;
}

/**
 * The shape every sub-app's home page takes: the side panel button, the app's
 * identity, its entry actions, then its own content.
 *
 * Each app supplies the parts it has rather than subclassing — the header,
 * spacing and panel button stay identical across apps, so the homes cannot drift
 * apart as they grow.
 */
export default function AppHome({ app, actions, children }: AppHomeProps) {
    return (
        <div className="app-home">
            <header className="app-home-head">
                <SidebarButton />
                <div className="app-home-title">
                    <h1>
                        <span className="app-home-icon" aria-hidden>
                            {app.icon}
                        </span>
                        {app.label}
                    </h1>
                    <p>{app.tagline}</p>
                </div>
            </header>

            {actions && <div className="app-home-actions">{actions}</div>}

            {children && <div className="app-home-body">{children}</div>}
        </div>
    );
}
