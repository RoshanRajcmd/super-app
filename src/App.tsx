import { useCallback, useMemo, useState } from "react";
import NoteEditor from "./NoteEditor";
import TodoView from "./TodoView";
import HabitTracker from "./HabitTracker";
import SidePanel from "./components/SidePanel";
import ThemeSettings from "./components/ThemeSettings";
import NotesHome from "./homes/NotesHome";
import TasksHome from "./homes/TasksHome";
import HabitsHome from "./homes/HabitsHome";
import { DEFAULT_APP, type AppId } from "./nav/apps";
import { NavContext, type NavContextValue } from "./nav/navContext";
import type { HabitViewMode } from "./types";
import { SCRATCH_NOTE_NAME, type NoteSource } from "./utils/noteFile";
import "./styles/App.css";

/**
 * Shell around the sub-apps.
 *
 * Every app is a home page plus the app itself, and the side panel switches
 * between them from any screen. The shell owns that navigation state, plus the
 * theme dialog the panel opens, so no sub-app has to know about either.
 */
function App() {
    const [currentApp, setCurrentApp] = useState<AppId>(DEFAULT_APP);
    const [screen, setScreen] = useState<"home" | "detail">("home");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showTheme, setShowTheme] = useState(false);

    /** The note the editor is on. Defaults to the app's original single note. */
    const [noteSource, setNoteSource] = useState<NoteSource>({
        kind: "store",
        name: SCRATCH_NOTE_NAME,
    });

    /** Where the tracker should open, when the home page picked a day. */
    const [habitEntry, setHabitEntry] = useState<{ date?: string; view?: HabitViewMode }>({});

    const goToApp = useCallback((id: AppId) => {
        setCurrentApp(id);
        // Always land on the home page: the panel is a switch between apps, not
        // a way back into wherever the user last was inside one.
        setScreen("home");
        setSidebarOpen(false);
    }, []);

    const nav = useMemo<NavContextValue>(
        () => ({
            currentApp,
            screen,
            goToApp,
            openDetail: () => setScreen("detail"),
            goHome: () => setScreen("home"),
            sidebarOpen,
            openSidebar: () => setSidebarOpen(true),
            closeSidebar: () => setSidebarOpen(false),
            openThemeSettings: () => {
                setSidebarOpen(false);
                setShowTheme(true);
            },
        }),
        [currentApp, screen, goToApp, sidebarOpen]
    );

    /** Open a note from the notes home page. */
    function openNote(source: NoteSource) {
        setNoteSource(source);
        setScreen("detail");
    }

    /** Open the habit tracker, optionally on a specific day. */
    function openHabits(date?: string, view?: HabitViewMode) {
        setHabitEntry({ date, view });
        setScreen("detail");
    }

    return (
        <NavContext.Provider value={nav}>
            <div className="app">
                {sidebarOpen && <SidePanel />}

                {showTheme && (
                    <div
                        className="theme-overlay"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) setShowTheme(false);
                        }}
                    >
                        <ThemeSettings onClose={() => setShowTheme(false)} />
                    </div>
                )}

                {currentApp === "notes" &&
                    (screen === "home" ? (
                        <NotesHome onOpen={openNote} />
                    ) : (
                        <NoteEditor source={noteSource} onBack={() => setScreen("home")} />
                    ))}

                {currentApp === "tasks" &&
                    (screen === "home" ? (
                        <TasksHome onOpen={() => setScreen("detail")} />
                    ) : (
                        <TodoView onBack={() => setScreen("home")} />
                    ))}

                {currentApp === "habits" &&
                    (screen === "home" ? (
                        <HabitsHome onOpen={openHabits} />
                    ) : (
                        <HabitTracker
                            initialDate={habitEntry.date}
                            initialView={habitEntry.view}
                            onBack={() => setScreen("home")}
                        />
                    ))}
            </div>
        </NavContext.Provider>
    );
}

export default App;
