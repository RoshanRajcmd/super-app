import type { HabitSheet } from "../types";
import { isFuture } from "../utils/dateUtils";
import { appliesOnDayType } from "../utils/habitStats";
import { dayTypeLabel } from "../utils/habitLabels";

interface HabitDayViewProps {
    sheet: HabitSheet;
    date: string;
    onToggle: (habitName: string, date: string, done: boolean) => void;
    onRemoveHabit: (habitName: string) => void;
    busy: boolean;
}

/**
 * A single day as a plain checklist — the fastest way to tick things off,
 * which is what the day view is for.
 */
export default function HabitDayView({
    sheet,
    date,
    onToggle,
    onRemoveHabit,
    busy,
}: HabitDayViewProps) {
    if (sheet.habits.length === 0) {
        return <div className="empty-state">No habits yet. Add one to start tracking.</div>;
    }

    const future = isFuture(date);

    return (
        <div className="habit-day-list">
            {future && (
                <p className="habit-note">
                    This day hasn't arrived yet — check things off when it does.
                </p>
            )}

            {sheet.habits.map((habit) => {
                const done = habit.done.has(date);
                // Days before the habit joined the routine do not count towards
                // its score; ticking one moves its start date back.
                const untracked = date < habit.trackedFrom;
                // Not due on this kind of day, so it is locked instead of looking
                // like a habit that was skipped.
                const offDay = !appliesOnDayType(habit, date);
                const id = `habit-${date}-${habit.name.replace(/\s+/g, "-")}`;
                return (
                    <div
                        key={habit.name}
                        className={`habit-day-item ${done ? "completed" : ""} ${
                            untracked ? "untracked" : ""
                        } ${offDay ? "offday" : ""}`}
                    >
                        <input
                            id={id}
                            type="checkbox"
                            checked={done}
                            disabled={busy || future || offDay}
                            onChange={(e) => onToggle(habit.name, date, e.target.checked)}
                        />
                        <label htmlFor={id}>
                            {habit.name}
                            {offDay ? (
                                <span className="untracked-tag">
                                    {dayTypeLabel(habit.dayType).toLowerCase()} only
                                </span>
                            ) : (
                                untracked && (
                                    <span className="untracked-tag">
                                        added {habit.trackedFrom}
                                    </span>
                                )
                            )}
                        </label>
                        <button
                            className="remove-habit"
                            aria-label={`Remove ${habit.name}`}
                            disabled={busy}
                            onClick={() => onRemoveHabit(habit.name)}
                        >
                            ✕
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
