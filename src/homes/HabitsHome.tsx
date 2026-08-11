import { MdGridOn } from "react-icons/md";
import AppHome from "./AppHome";
import HabitHeatmap from "../components/HabitHeatmap";
import HabitProgressBar from "../components/HabitProgressBar";
import { appById } from "../nav/apps";
import { useHabitSnapshot } from "../hooks/useHabitSnapshot";
import { dayStats, perfectDayStreak, rangeStats } from "../utils/habitStats";
import {
    getIsoWeekRange,
    getMonthRange,
    getYearRange,
    today,
} from "../utils/dateUtils";
import type { HabitViewMode } from "../types";

interface HabitsHomeProps {
    /**
     * Enter the tracker. A date and view are passed when the user picked a
     * specific day out of the heatmap, so the tracker opens on it.
     */
    onOpen: (date?: string, view?: HabitViewMode) => void;
}

/**
 * Home page for the habit tracker: how the day, week, month and year are going,
 * plus the full-year commit graph, with the editable grid one tap away.
 */
export default function HabitsHome({ onOpen }: HabitsHomeProps) {
    const { sheet, loading, error } = useHabitSnapshot();
    const date = today();
    const week = getIsoWeekRange(date);
    const month = getMonthRange(date);
    const year = getYearRange(date);

    return (
        <AppHome
            app={appById("habits")}
            actions={
                <button className="app-btn" onClick={() => onOpen()}>
                    <MdGridOn aria-hidden /> Open tracker
                </button>
            }
        >
            {error && <div className="home-error">{error}</div>}

            {loading && <p className="home-empty">Loading your sheet...</p>}

            {!loading && sheet === null && (
                <p className="home-empty">
                    No habit sheet yet. Open the tracker to point it at a{" "}
                    <code>.csv</code>, or create one.
                </p>
            )}

            {sheet !== null && (
                <>
                    <section className="home-section">
                        <h2>📊 Progress Overview</h2>
                        <div className="habit-summary">
                            <HabitProgressBar
                                label="Today"
                                stats={dayStats(sheet, date)}
                                prominent
                            />
                            <HabitProgressBar
                                label="Week"
                                stats={rangeStats(sheet, week.start, week.end)}
                            />
                            <HabitProgressBar
                                label="Month"
                                stats={rangeStats(sheet, month.start, month.end)}
                            />
                            <HabitProgressBar
                                label="Year"
                                stats={rangeStats(sheet, year.start, year.end)}
                            />
                            <div className="habit-streak">
                                <span className="streak-value">{perfectDayStreak(sheet)}</span>
                                <span className="streak-label">🔥 day perfect streak</span>
                            </div>
                        </div>
                    </section>

                    <section className="home-section">
                        <h2>{sheet.year} activity</h2>
                        {/* Clicking a square opens the tracker on that day, so the
                            graph stays a way in rather than a dead end. */}
                        <HabitHeatmap
                            sheet={sheet}
                            year={sheet.year}
                            selectedDate={date}
                            onSelectDate={(picked) => onOpen(picked, "day")}
                        />
                        <p className="home-hint">
                            {sheet.habits.length} habit{sheet.habits.length === 1 ? "" : "s"} ·
                            click a square to open that day
                        </p>
                    </section>
                </>
            )}
        </AppHome>
    );
}
