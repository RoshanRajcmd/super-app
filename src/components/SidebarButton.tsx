import { GoSidebarCollapse } from "react-icons/go";
import { useNav } from "../nav/navContext";

/**
 * Opens the side panel. Present in every screen's header, so switching app is
 * always one tap away.
 */
export default function SidebarButton() {
    const { openSidebar } = useNav();

    return (
        <button
            className="sidebar-btn icon-btn"
            onClick={openSidebar}
            aria-label="Open app menu"
            title="Apps"
        >
            <GoSidebarCollapse aria-hidden />
        </button>
    );
}
