import { useCallback, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { IoChevronBackCircle } from "react-icons/io5";
import type { HabitDayType, HabitSheet, HabitViewMode } from "./types";
import {
    SheetConflictError,
    createSheetLocation,
    currentSheet,
    exportSheet,
    pickSheet,
    reloadSheet,
    saveSheet,
    sheetMtime,
} from "./utils/habitFile";
import {
    addHabit as addHabitToBook,
    createHabitBook,
    parseHabitBook,
    removeHabit as removeHabitFromBook,
    serializeHabitBook,
    setMark,
    type HabitBook,
    type HabitSeed,
} from "./utils/habitSheet";
import {
    daysInRange,
    formatDate,
    formatMonthYear,
    getIsoWeekRange,
    getMonthRange,
    today,
} from "./utils/dateUtils";
import { isTauri } from "./utils/platform";
import { getStore } from "./utils/keyValueStore";
import HabitDayView from "./components/HabitDayView";
import HabitGrid from "./components/HabitGrid";
import HabitHeatmap from "./components/HabitHeatmap";
import DayTypeSelect from "./components/DayTypeSelect";
import SheetSetup from "./components/SheetSetup";
import SidebarButton from "./components/SidebarButton";
import "./styles/HabitTracker.css";
import { IoReload } from "react-icons/io5";
import { CgExport, CgImport } from "react-icons/cg";

interface HabitTrackerProps {
    /** Day to open on. Defaults to today. */
    initialDate?: string;
    /** View to open in. Defaults to the week grid. */
    initialView?: HabitViewMode;
    onBack: () => void;
}

/** Stored preference for pinning the habit column in the grid views. */
const FROZEN_KEY = "habitColumnFrozen";

/**
 * How often to look for a copy of the sheet edited elsewhere — another machine
 * writing into the same synced folder, or Excel on this one.
 *
 * Half a minute is frequent enough that a change made on a laptop shows up while
 * the phone is still in hand, and rare enough to be a stat call rather than a
 * drain.
 */
const REFRESH_MS = 30_000;

/**
 * Cheap content fingerprint (FNV-1a) telling whether a re-read of the sheet
 * actually changed anything.
 *
 * Needed because some Android document providers report no modification time at
 * all: for those the only way to answer "has it changed?" is to read the bytes and
 * compare, and re-parsing an unchanged sheet would throw away the scroll position
 * every thirty seconds.
 */
function fingerprint(bytes: Uint8Array): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        hash ^= bytes[i];
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * Habit tracker over a `.csv` file.
 *
 * The parsed sheet is held in a ref, not state: it is a large mutable object that
 * must round-trip byte-for-byte, so React re-renders off a cheap snapshot of the
 * readable part (`sheet`) that is replaced whenever the book changes.
 */
export default function HabitTracker({ initialDate, initialView, onBack }: HabitTrackerProps) {
    const book = useRef<HabitBook | null>(null);
    const mtime = useRef<number | null>(null);
    /** Fingerprint of the bytes the current book was parsed from. */
    const loadedHash = useRef<number | null>(null);
    /** Mirrors `busy` for the refresh poll, which must not re-run on every save. */
    const busyRef = useRef(false);
    /** Guards against a slow poll overlapping the next one. */
    const refreshing = useRef(false);

    const [sheet, setSheet] = useState<HabitSheet | null>(null);
    const [sheetPath, setSheetPath] = useState<string | null>(null);
    const [view, setView] = useState<HabitViewMode>(initialView ?? "week");
    const [selectedDate, setSelectedDate] = useState(initialDate ?? today());
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [newHabit, setNewHabit] = useState("");
    const [newHabitDayType, setNewHabitDayType] = useState<HabitDayType>("both");
    const [frozen, setFrozen] = useState(true);
    /** Drives the browser's import, which needs a real file input to click. */
    const fileInput = useRef<HTMLInputElement>(null);

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
                dayType: h.dayType,
            })),
        });
    }, []);

    const adoptHandle = useCallback(
        (path: string, bytes: Uint8Array | null, fileMtime: number | null, year: number) => {
            if (bytes === null) return false;
            const parsed = parseHabitBook(bytes, year);
            book.current = parsed;
            mtime.current = fileMtime;
            loadedHash.current = fingerprint(bytes);
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

    useEffect(() => {
        busyRef.current = busy;
    }, [busy]);

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
            const bytes = serializeHabitBook(current);
            mtime.current = await saveSheet(bytes, mtime.current);
            // Remember what was written, so the refresh poll recognises our own
            // save instead of treating it as an outside edit.
            loadedHash.current = fingerprint(bytes);
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

    /**
     * Pick up an outside edit: a stat first, and the bytes only if that says the
     * file moved on (or cannot say).
     *
     * Skipped while a save is in flight, since the file is mid-write and the reply
     * would be nonsense.
     */
    const refreshIfChanged = useCallback(async () => {
        const current = book.current;
        if (!current || busyRef.current || refreshing.current) return;

        refreshing.current = true;
        try {
            const stamp = await sheetMtime();
            if (stamp !== null && stamp === mtime.current) return;

            const handle = await reloadSheet();
            if (handle.bytes === null) return;

            if (fingerprint(handle.bytes) === loadedHash.current) {
                // Same content under a new timestamp — a sync client rewriting an
                // identical file. Take the stamp so the next poll stays quiet.
                mtime.current = handle.mtime;
                return;
            }

            if (adoptHandle(handle.path, handle.bytes, handle.mtime, current.sheet.year)) {
                syncFromBook();
            }
        } catch (e) {
            // A background poll must not put an error banner over a working app,
            // with one exception: a withdrawn permission never fixes itself, and
            // silence would leave edits piling up against a file we can no longer
            // read. That happens when another program replaces the file rather than
            // rewriting it, which hands the document a new identity.
            if (String(e).includes("withdrawn")) {
                setError(
                    "Lost access to the sheet — it was replaced by another program. Import it again to reconnect."
                );
            }
            console.error("Habit sheet refresh failed:", e);
        } finally {
            refreshing.current = false;
        }
    }, [adoptHandle, syncFromBook]);

    // Poll the file for edits made elsewhere, and check once more whenever the app
    // comes back to the foreground — on a phone that is when a sync has usually
    // just finished. Only runs once a sheet is open.
    useEffect(() => {
        if (sheetPath === null) return;

        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") void refreshIfChanged();
        }, REFRESH_MS);

        const onVisible = () => {
            if (document.visibilityState === "visible") void refreshIfChanged();
        };
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [sheetPath, refreshIfChanged]);

    /** Add the habit typed into the footer row, on the days its selector says. */
    function submitNewHabit() {
        const name = newHabit.trim();
        if (name === "") return;
        // Tracked from today, so past days keep their scores.
        mutate((b) => addHabitToBook(b, name, today(), newHabitDayType));
        setNewHabit("");
        setNewHabitDayType("both");
    }

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

    async function handleCreate(seeds: HabitSeed[]) {
        const year = dayjs().year();
        setBusy(true);
        setError(null);
        try {
            const handle = await createSheetLocation(`habits-${year}.csv`);
            if (!handle) return;

            // Seed habits start today: the earlier part of the year was never
            // tracked, so it should not count as missed.
            book.current = createHabitBook(year, seeds, today());
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
     * Save a copy of the sheet elsewhere: a save dialog on desktop, a download in
     * the browser. Offered on both, so a backup or a copy for another device is
     * always one click away wherever the tracked sheet happens to live.
     */
    async function handleExport() {
        const current = book.current;
        if (!current) return;

        setBusy(true);
        try {
            const written = await exportSheet(
                serializeHabitBook(current),
                `habits-${current.sheet.year}.csv`
            );
            setError(null);
            setWarning(written === null ? null : `Copy saved to ${written}`);
        } catch (e) {
            setError(`Couldn't export: ${String(e)}`);
        } finally {
            setBusy(false);
        }
    }

    if (loading) {
        return (
            <div className="habit-tracker">
                <div className="habit-header">
                    <SidebarButton />
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
                    <SidebarButton />
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
                <SidebarButton />
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
                    <button
                        onClick={() => (isTauri() ? handleOpen() : fileInput.current?.click())}
                        disabled={busy}
                        aria-label="Import"
                        title="Import a .csv"
                    >
                        <CgImport size="20px" aria-hidden />
                    </button>
                    <button
                        onClick={handleReload}
                        disabled={busy}
                        aria-label="Reload"
                        title="Reload from the file"
                    >
                        <IoReload size="20px" aria-hidden />
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={busy}
                        aria-label="Export"
                        title="Save a copy"
                    >
                        <CgExport size="20px" aria-hidden />
                    </button>
                    {/* The browser has no OS picker, so the import button drives
                        this instead. */}
                    {!isTauri() && (
                        <input
                            ref={fileInput}
                            type="file"
                            accept=".csv,text/csv"
                            hidden
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleOpen(file);
                                e.target.value = "";
                            }}
                        />
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
                            submitNewHabit();
                        }}
                    />
                    <DayTypeSelect
                        value={newHabitDayType}
                        label="Days the new habit applies to"
                        disabled={busy}
                        onChange={setNewHabitDayType}
                    />
                    <button
                        disabled={busy || newHabit.trim() === ""}
                        onClick={submitNewHabit}
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
