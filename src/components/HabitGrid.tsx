import type { HabitSheet } from "../types";
import { dayStats, heatLevel } from "../utils/habitStats";
import { formatDayShort, isFuture, today } from "../utils/dateUtils";

interface HabitGridProps {
    sheet: HabitSheet;
    /** Days to show as columns, in order. */
    dates: string[];
    onToggle: (habitName: string, date: string, done: boolean) => void;
    onRemoveHabit: (habitName: string) => void;
    /** Toggling is blocked while a save is in flight. */
    busy: boolean;
}

/**
 * The spreadsheet, rendered: habits down the side, days across the top,
 * a checkbox at each intersection and a per-day completion bar in the footer.
 *
 * Used for the week and month views; the day view has its own layout.
 */
export default function HabitGrid({
    sheet,
    dates,
    onToggle,
    onRemoveHabit,
    busy,
}: HabitGridProps) {
    const now = today();

    if (sheet.habits.length === 0) {
        return (
            <div className="empty-state">
                No habits yet. Add one to start tracking.
            </div>
        );
    }

    return (
        <div className="habit-grid-scroll">
            <table className="habit-grid">
                <thead>
                    <tr>
                        <th className="habit-name-col">Habit</th>
                        {dates.map((date) => (
                            <th
                                key={date}
                                className={`habit-day-col ${date === now ? "is-today" : ""} ${
                                    isFuture(date) ? "is-future" : ""
                                }`}
                            >
                                {formatDayShort(date)}
                            </th>
                        ))}
                    </tr>
                </thead>

                <tbody>
                    {sheet.habits.map((habit) => (
                        <tr key={habit.name}>
                            <th scope="row" className="habit-name-col">
                                <span className="habit-name">{habit.name}</span>
                                <button
                                    className="remove-habit"
                                    aria-label={`Remove ${habit.name}`}
                                    disabled={busy}
                                    onClick={() => onRemoveHabit(habit.name)}
                                >
                                    ✕
                                </button>
                            </th>

                            {dates.map((date) => {
                                const done = habit.done.has(date);
                                // Before the habit joined the routine it is not
                                // counted either way, so the cell is shown as
                                // inactive rather than as an unchecked miss.
                                const untracked = date < habit.trackedFrom;
                                return (
                                    <td
                                        key={date}
                                        className={`habit-cell ${date === now ? "is-today" : ""} ${
                                            untracked ? "is-untracked" : ""
                                        }`}
                                        title={
                                            untracked
                                                ? `Not tracked yet — added ${habit.trackedFrom}`
                                                : undefined
                                        }
                                    >
                                        <input
                                            type="checkbox"
                                            checked={done}
                                            disabled={busy || isFuture(date)}
                                            aria-label={`${habit.name} on ${date}${
                                                untracked ? " (not tracked yet)" : ""
                                            }`}
                                            onChange={(e) =>
                                                onToggle(habit.name, date, e.target.checked)
                                            }
                                        />
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>

                <tfoot>
                    <tr>
                        <th scope="row" className="habit-name-col">
                            Day score
                        </th>
                        {dates.map((date) => {
                            const stats = dayStats(sheet, date);
                            return (
                                <td key={date} className="habit-day-score">
                                    <div
                                        className="mini-bar"
                                        title={`${stats.completed}/${stats.possible}`}
                                    >
                                        <div
                                            className={`mini-fill level-${heatLevel(stats.percent)}`}
                                            style={{ height: `${Math.min(100, stats.percent)}%` }}
                                        />
                                    </div>
                                </td>
                            );
                        })}
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}
