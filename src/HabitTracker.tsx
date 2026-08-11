import { useCallback, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { IoChevronBackCircle } from "react-icons/io5";
import type { HabitSheet, HabitViewMode } from "./types";
import {
    SheetConflictError,
    createSheetLocation,
    currentSheet,
    downloadSheet,
    pickSheet,
    reloadSheet,
    saveSheet,
} from "./utils/habitFile";
import {
    addHabit as addHabitToBook,
    createHabitBook,
    parseHabitBook,
    removeHabit as removeHabitFromBook,
    serializeHabitBook,
    setMark,
    type HabitBook,
} from "./utils/habitSheet";
import { dayStats, perfectDayStreak, rangeStats } from "./utils/habitStats";
import {
    daysInRange,
    formatDate,
    formatMonthYear,
    getIsoWeekRange,
    getMonthRange,
    getYearRange,
    today,
} from "./utils/dateUtils";
import { isTauri } from "./utils/platform";
import { getStore } from "./utils/keyValueStore";
import HabitDayView from "./components/HabitDayView";
import HabitGrid from "./components/HabitGrid";
import HabitHeatmap from "./components/HabitHeatmap";
import HabitProgressBar from "./components/HabitProgressBar";
import SheetSetup from "./components/SheetSetup";
import "./styles/HabitTracker.css";

interface HabitTrackerProps {
    onBack: () => void;
}

/** Stored preference for pinning the habit column in the grid views. */
const FROZEN_KEY = "habitColumnFrozen";

/**
 * Habit tracker over a `.csv` file.
 *
 * The parsed sheet is held in a ref, not state: it is a large mutable object that
 * must round-trip byte-for-byte, so React re-renders off a cheap snapshot of the
 * readable part (`sheet`) that is replaced whenever the book changes.
 */
export default function HabitTracker({ onBack }: HabitTrackerProps) {
    const book = useRef<HabitBook | null>(null);
    const mtime = useRef<number | null>(null);

    const [sheet, setSheet] = useState<HabitSheet | null>(null);
    const [sheetPath, setSheetPath] = useState<string | null>(null);
    const [view, setView] = useState<HabitViewMode>("week");
    const [selectedDate, setSelectedDate] = useState(today());
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [newHabit, setNewHabit] = useState("");
    const [frozen, setFrozen] = useState(true);

    /** Publish a fresh snapshot so React re-renders after mutating the book. */
    const syncFromBook = useCallback(() => {
        const current = book.current;
        if (!current) return;
        setSheet({
            year: current.sheet.year,
            habits: current.sheet.habits.map((h) => ({
                name: h.name,
                done: new Set(h.done),
                trackedFrom: h.trackedFrom,
            })),
        });
    }, []);

    const adoptHandle = useCallback(
        (path: string, bytes: Uint8Array | null, fileMtime: number | null, year: number) => {
            if (bytes === null) return false;
            const parsed = parseHabitBook(bytes, year);
            book.current = parsed;
            mtime.current = fileMtime;
            setSheetPath(path);
            setWarning(
                parsed.unreadableHeaders.length > 0
                    ? `Ignored ${parsed.unreadableHeaders.length} column(s) whose headers aren't dates: ${parsed.unreadableHeaders
                          .slice(0, 5)
                          .join(", ")}`
                    : null
            );
            return true;
        },
        []
    );

    // Reopen the sheet chosen on a previous run. The file is external state, so
    // reading it on mount is the intended use of an effect.
    useEffect(() => {
        let active = true;

        currentSheet()
            .then((handle) => {
                if (!active) return;
                if (handle && adoptHandle(handle.path, handle.bytes, handle.mtime, dayjs().year())) {
                    syncFromBook();
                }
            })
            .catch((e) => {
                if (active) setError(`Couldn't open your habit sheet: ${String(e)}`);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [adoptHandle, syncFromBook]);

    // Restore the frozen-column preference. Defaults to on until it arrives, so
    // the desktop case needs no wait.
    useEffect(() => {
        let active = true;

        getStore()
            .get<boolean>(FROZEN_KEY)
            .then((saved) => {
                if (active && typeof saved === "boolean") setFrozen(saved);
            })
            .catch((e) => console.error("Failed to load column preference:", e));

        return () => {
            active = false;
        };
    }, []);

    /** Pin or unpin the habit column, remembering the choice for next time. */
    function toggleFrozen() {
        setFrozen((previous) => {
            const next = !previous;
            // Fire-and-forget: a failed write only loses the preference, so it
            // should not block the column from moving.
            getStore()
                .set(FROZEN_KEY, next)
                .catch((e) => console.error("Failed to save column preference:", e));
            return next;
        });
    }

    /**
     * Persist the sheet. On a conflict the on-disk copy wins: it is reloaded
     * and the local edit is dropped, since silently overwriting a sync from
     * another device would lose data.
     */
    const persist = useCallback(async () => {
        const current = book.current;
        if (!current) return;

        try {
            mtime.current = await saveSheet(serializeHabitBook(current), mtime.current);
            setError(null);
        } catch (e) {
            if (e instanceof SheetConflictError) {
                const handle = await reloadSheet();
                if (adoptHandle(handle.path, handle.bytes, handle.mtime, current.sheet.year)) {
                    syncFromBook();
                }
                setError(
                    "The sheet changed elsewhere (probably a Drive sync), so it was reloaded and your last change was not applied. Try again."
                );
                return;
            }
            setError(`Couldn't save: ${String(e)}`);
        }
    }, [adoptHandle, syncFromBook]);

    /** Run a mutation against the book, then snapshot and save. */
    const mutate = useCallback(
        async (change: (b: HabitBook) => void) => {
            const current = book.current;
            if (!current) return;

            setBusy(true);
            try {
                change(current);
                syncFromBook();
                await persist();
            } catch (e) {
                setError(String(e));
            } finally {
                setBusy(false);
            }
        },
        [persist, syncFromBook]
    );

    async function handleOpen(browserFile?: File) {
        setBusy(true);
        setError(null);
        try {
            const handle = await pickSheet(browserFile);
            if (!handle) return;
            if (handle.bytes === null) {
                setError("That file is empty.");
                return;
            }
            adoptHandle(handle.path, handle.bytes, handle.mtime, dayjs().year());
            syncFromBook();
        } catch (e) {
            setError(`Couldn't open that file: ${String(e)}`);
        } finally {
            setBusy(false);
        }
    }

    async function handleCreate(habitNames: string[]) {
        const year = dayjs().year();
        setBusy(true);
        setError(null);
        try {
            const handle = await createSheetLocation(`habits-${year}.csv`);
            if (!handle) return;

            // Seed habits start today: the earlier part of the year was never
            // tracked, so it should not count as missed.
            book.current = createHabitBook(year, habitNames, today());
            // A location the user just chose holds no file yet, so there is
            // nothing to conflict with on this first write.
            mtime.current = handle.mtime;
            setSheetPath(handle.path);
            setWarning(null);
            syncFromBook();
            await persist();

            if (!isTauri()) {
                setWarning(
                    "Saved to browser storage. Use Export to keep a copy in your Drive folder."
                );
            }
        } catch (e) {
            setError(`Couldn't create the sheet: ${String(e)}`);
        } finally {
            setBusy(false);
        }
    }

    async function handleReload() {
        setBusy(true);
        try {
            const handle = await reloadSheet();
            if (adoptHandle(handle.path, handle.bytes, handle.mtime, sheet?.year ?? dayjs().year())) {
                syncFromBook();
                setError(null);
            }
        } catch (e) {
            setError(`Couldn't reload: ${String(e)}`);
        } finally {
            setBusy(false);
        }
    }

    /**
     * Download a copy of the sheet. Browser-only: saves there go to browser
     * storage, so this is the only way out to a real file. On desktop the picked
     * CSV is already the source of truth.
     */
    function handleExport() {
        const current = book.current;
        if (!current) return;
        downloadSheet(serializeHabitBook(current), `habits-${current.sheet.year}.csv`);
    }

    if (loading) {
        return (
            <div className="habit-tracker">
                <div className="habit-header">
                    <button
                        className="back-btn icon-btn"
                        onClick={onBack}
                        aria-label="Back"
                        title="Back"
                    >
                        <IoChevronBackCircle aria-hidden />
                    </button>
                    <h1>🔥 Habit Tracker</h1>
                    <span />
                </div>
                <div className="empty-state">Loading your sheet...</div>
            </div>
        );
    }

    if (!sheet) {
        return (
            <div className="habit-tracker">
                <div className="habit-header">
                    <button
                        className="back-btn icon-btn"
                        onClick={onBack}
                        aria-label="Back"
                        title="Back"
                    >
                        <IoChevronBackCircle aria-hidden />
                    </button>
                    <h1>🔥 Habit Tracker</h1>
                    <span />
                </div>
                {error && <div className="habit-error">{error}</div>}
                <SheetSetup
                    year={dayjs().year()}
                    onOpen={handleOpen}
                    onCreate={handleCreate}
                    busy={busy}
                />
            </div>
        );
    }

    const week = getIsoWeekRange(selectedDate);
    const month = getMonthRange(selectedDate);
    const year = getYearRange(selectedDate);

    const weekStats = rangeStats(sheet, week.start, week.end);
    const monthStats = rangeStats(sheet, month.start, month.end);
    const yearStats = rangeStats(sheet, year.start, year.end);
    const selectedDayStats = dayStats(sheet, selectedDate);
    const streak = perfectDayStreak(sheet);

    /** Step the selected date by one unit of the active view. */
    function shift(direction: -1 | 1) {
        const unit = view === "day" ? "day" : view === "week" ? "week" : view === "month" ? "month" : "year";
        setSelectedDate(dayjs(selectedDate).add(direction, unit).format("YYYY-MM-DD"));
    }

    const periodLabel =
        view === "day"
            ? formatDate(selectedDate)
            : view === "week"
              ? `${formatDate(week.start)} – ${formatDate(week.end)}`
              : view === "month"
                ? formatMonthYear(selectedDate)
                : String(dayjs(selectedDate).year());

    return (
        <div className="habit-tracker">
            <div className="habit-header">
                <button
                    className="back-btn icon-btn"
                    onClick={onBack}
                    aria-label="Back"
                    title="Back"
                >
                    <IoChevronBackCircle aria-hidden />
                </button>
                <h1>🔥 Habit Tracker</h1>
                <div className="habit-header-actions">
                    {isTauri() ? (
                        <button onClick={handleReload} disabled={busy}>
                            Reload
                        </button>
                    ) : (
                        <button onClick={handleExport} disabled={busy}>
                            Export
                        </button>
                    )}
                </div>
            </div>

            {sheetPath && (
                <p className="habit-path" title={sheetPath}>
                    {isTauri() ? sheetPath : `${sheetPath} (browser storage)`}
                </p>
            )}
            {error && <div className="habit-error">{error}</div>}
            {warning && <div className="habit-warning">{warning}</div>}

            <div className="habit-summary">
                <HabitProgressBar
                    label={view === "day" ? "Today" : "Selected day"}
                    stats={selectedDayStats}
                    prominent={view === "day"}
                />
                <HabitProgressBar label="Week" stats={weekStats} prominent={view === "week"} />
                <HabitProgressBar label="Month" stats={monthStats} prominent={view === "month"} />
                <HabitProgressBar label="Year" stats={yearStats} prominent={view === "year"} />
                <div className="habit-streak">
                    <span className="streak-value">{streak}</span>
                    <span className="streak-label">🔥 day perfect streak</span>
                </div>
            </div>

            <div className="habit-controls">
                <div className="view-switcher">
                    {(["day", "week", "month", "year"] as HabitViewMode[]).map((mode) => (
                        <button
                            key={mode}
                            className={view === mode ? "active" : ""}
                            onClick={() => setView(mode)}
                        >
                            {mode[0].toUpperCase() + mode.slice(1)}
                        </button>
                    ))}
                </div>

                <div className="period-nav">
                    <button onClick={() => shift(-1)} aria-label="Previous period">
                        ‹
                    </button>
                    <span className="period-label">{periodLabel}</span>
                    <button onClick={() => shift(1)} aria-label="Next period">
                        ›
                    </button>
                    <button className="today-btn" onClick={() => setSelectedDate(today())}>
                        Today
                    </button>
                </div>

                {/* Only the grid views have a habit column to pin. */}
                {(view === "week" || view === "month") && (
                    <button
                        className={`freeze-btn ${frozen ? "active" : ""}`}
                        onClick={toggleFrozen}
                        aria-pressed={frozen}
                        title={
                            frozen
                                ? "Habit column stays put while scrolling. Click to unpin."
                                : "Habit column scrolls with the days. Click to pin."
                        }
                    >
                        {frozen ? "📌" : "📍"} Habit column
                    </button>
                )}
            </div>

            <div className="habit-body">
                {view === "day" && (
                    <HabitDayView
                        sheet={sheet}
                        date={selectedDate}
                        onToggle={(name, date, done) => mutate((b) => setMark(b, name, date, done))}
                        onRemoveHabit={(name) => {
                            if (confirm(`Remove "${name}" and all its history?`)) {
                                mutate((b) => removeHabitFromBook(b, name));
                            }
                        }}
                        busy={busy}
                    />
                )}

                {(view === "week" || view === "month") && (
                    <HabitGrid
                        sheet={sheet}
                        dates={daysInRange(
                            view === "week" ? week.start : month.start,
                            view === "week" ? week.end : month.end
                        )}
                        onToggle={(name, date, done) => mutate((b) => setMark(b, name, date, done))}
                        onRemoveHabit={(name) => {
                            if (confirm(`Remove "${name}" and all its history?`)) {
                                mutate((b) => removeHabitFromBook(b, name));
                            }
                        }}
                        busy={busy}
                        frozen={frozen}
                    />
                )}

                {view === "year" && (
                    <HabitHeatmap
                        sheet={sheet}
                        year={dayjs(selectedDate).year()}
                        selectedDate={selectedDate}
                        onSelectDate={(date) => {
                            setSelectedDate(date);
                            setView("day");
                        }}
                    />
                )}
            </div>

            {view !== "year" && (
                <div className="habit-add-row">
                    <input
                        type="text"
                        value={newHabit}
                        placeholder="Add a habit..."
                        onChange={(e) => setNewHabit(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const name = newHabit.trim();
                            if (name === "") return;
                            // Tracked from today, so past days keep their scores.
                            mutate((b) => addHabitToBook(b, name, today()));
                            setNewHabit("");
                        }}
                    />
                    <button
                        disabled={busy || newHabit.trim() === ""}
                        onClick={() => {
                            const name = newHabit.trim();
                            if (name === "") return;
                            // Tracked from today, so past days keep their scores.
                            mutate((b) => addHabitToBook(b, name, today()));
                            setNewHabit("");
                        }}
                    >
                        Add habit
                    </button>
                </div>
            )}

            <div className="habit-footer-note">
                Year sheet: {sheet.year} · {sheet.habits.length} habit
                {sheet.habits.length === 1 ? "" : "s"}
                {view === "year" && " · click a square to open that day"}
            </div>
        </div>
    );
}
