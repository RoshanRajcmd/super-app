import { useRef, useState } from "react";
import { isTauri } from "../utils/platform";

interface SheetSetupProps {
    year: number;
    /** Open an existing CSV sheet. In the browser a `File` comes from the input. */
    onOpen: (browserFile?: File) => void;
    /** Create a CSV sheet seeded with these habit names. */
    onCreate: (habitNames: string[]) => void;
    busy: boolean;
}

const STARTER_HABITS = [
    "Wake up early",
    "Exercise",
    "Read",
    "Meditate",
    "No junk food",
];

/**
 * First-run screen: point the tracker at a spreadsheet, or make one.
 *
 * Shown until a sheet is chosen; after that the tracker remembers it.
 */
export default function SheetSetup({ year, onOpen, onCreate, busy }: SheetSetupProps) {
    const [habits, setHabits] = useState<string[]>(STARTER_HABITS);
    const [draft, setDraft] = useState("");
    const fileInput = useRef<HTMLInputElement>(null);

    function addDraft() {
        const name = draft.trim();
        if (name === "" || habits.includes(name)) {
            setDraft("");
            return;
        }
        setHabits([...habits, name]);
        setDraft("");
    }

    return (
        <div className="sheet-setup">
            <h2>Set up your habit sheet</h2>
            <p className="setup-intro">
                Habits are stored in a <code>.csv</code> spreadsheet: one row per habit,
                one column per day, and a <code>Daily Progress %</code> row across the
                top.{" "}
                {isTauri()
                    ? "Keep it in your Google Drive folder and every change syncs automatically."
                    : "In the browser the sheet lives in local storage — use Export to save a copy."}
            </p>

            <div className="setup-options">
                <section className="setup-card">
                    <h3>Open existing</h3>
                    <p>Already have a habit spreadsheet? Point the tracker at it.</p>
                    {isTauri() ? (
                        <button className="app-btn" onClick={() => onOpen()} disabled={busy}>
                            Choose file
                        </button>
                    ) : (
                        <>
                            <button
                                className="app-btn"
                                onClick={() => fileInput.current?.click()}
                                disabled={busy}
                            >
                                Choose file
                            </button>
                            <input
                                ref={fileInput}
                                type="file"
                                accept=".csv,text/csv"
                                hidden
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) onOpen(file);
                                    e.target.value = "";
                                }}
                            />
                        </>
                    )}
                </section>

                <section className="setup-card">
                    <h3>Create for {year}</h3>
                    <p>Start a fresh sheet with these daily habits:</p>

                    <ul className="setup-habit-list">
                        {habits.map((name) => (
                            <li key={name}>
                                <span>{name}</span>
                                <button
                                    className="remove-habit"
                                    aria-label={`Remove ${name}`}
                                    onClick={() => setHabits(habits.filter((h) => h !== name))}
                                >
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ul>

                    <div className="setup-add-row">
                        <input
                            type="text"
                            value={draft}
                            placeholder="Add a habit..."
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addDraft();
                                }
                            }}
                        />
                        <button onClick={addDraft} disabled={draft.trim() === ""}>
                            Add
                        </button>
                    </div>

                    <button
                        className="app-btn"
                        onClick={() => onCreate(habits)}
                        disabled={busy || habits.length === 0}
                    >
                        {busy ? "Working..." : "Create sheet"}
                    </button>
                </section>
            </div>
        </div>
    );
}
