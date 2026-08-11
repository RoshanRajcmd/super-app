import { useState } from "react";
import { BsFillLightningChargeFill } from "react-icons/bs";
import NoteEditor from "./NoteEditor";
import TodoView from "./TodoView";
import HabitTracker from "./HabitTracker";
import ThemeSettings from "./components/ThemeSettings";
import "./styles/App.css";

type AppView = "home" | "notes" | "todos" | "habits";

function App() {
  const [currentView, setCurrentView] = useState<AppView>("home");
  const [showTheme, setShowTheme] = useState(false);

  return (
    <div className="app">
      {/* Available from every screen, so the theme can be changed in context.
          Light/dark lives inside the panel, alongside text and highlight. */}
      <div className="theme-controls">
        <button
          className="theme-toggle"
          onClick={() => setShowTheme(true)}
          aria-label="Theme settings"
          title="Theme settings"
        >
          ⚙
        </button>
      </div>

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

      {currentView === "home" && (
        <div className="home">
          <div className="home-header">
            <h1>
              <BsFillLightningChargeFill className="home-logo" aria-hidden />SuperApp
            </h1>
            <p>Your all-in-one productivity suite</p>
          </div>

          <div className="app-grid">
            <div
              className="app-card"
              onClick={() => setCurrentView("notes")}
            >
              <div className="app-icon">📝</div>
              <h2>Note Editor</h2>
              <p>Create, edit, and preview markdown notes with live rendering</p>
              <button className="app-btn">Open Notes</button>
            </div>

            <div
              className="app-card"
              onClick={() => setCurrentView("todos")}
            >
              <div className="app-icon">✓</div>
              <h2>Task Manager</h2>
              <p>Manage tasks with dates, times, locations, and meeting links</p>
              <button className="app-btn">Open Tasks</button>
            </div>

            <div
              className="app-card"
              onClick={() => setCurrentView("habits")}
            >
              <div className="app-icon">🔥</div>
              <h2>Habit Tracker</h2>
              <p>Track your daily routine in a spreadsheet, with day, week, month and year views</p>
              <button className="app-btn">Open Habits</button>
            </div>
          </div>

          <footer className="app-footer">
            <p>Built with React, TypeScript, and Tauri</p>
          </footer>
        </div>
      )}

      {currentView === "notes" && (
        <NoteEditor onBack={() => setCurrentView("home")} />
      )}

      {currentView === "todos" && (
        <TodoView onBack={() => setCurrentView("home")} />
      )}

      {currentView === "habits" && (
        <HabitTracker onBack={() => setCurrentView("home")} />
      )}
    </div>
  );
}

export default App;
