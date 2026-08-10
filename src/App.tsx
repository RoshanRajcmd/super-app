import { useState } from "react";
import NoteEditor from "./NoteEditor";
import TodoView from "./TodoView";
import "./App.css";

type AppView = "home" | "notes" | "todos";

function App() {
  const [currentView, setCurrentView] = useState<AppView>("home");

  return (
    <div className="app">
      {currentView === "home" && (
        <div className="home">
          <div className="home-header">
            <h1>🎯 SuperApp</h1>
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
    </div>
  );
}

export default App;
