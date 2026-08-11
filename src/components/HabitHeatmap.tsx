import dayjs from "dayjs";
import type { HabitSheet } from "../types";
import { dayStats, heatLevel } from "../utils/habitStats";
import { yearCalendarWeeks } from "../utils/dateUtils";

interface HabitHeatmapProps {
    sheet: HabitSheet;
    /** Year to lay out. Usually the sheet's own year. */
    year: number;
    /** Clicking a square jumps the day view to it. */
    onSelectDate: (date: string) => void;
    selectedDate: string;
}

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

/**
 * Git-commit-graph view of the year: one column per ISO week, one square per
 * day, shaded by how much of that day's routine was completed.
 */
export default function HabitHeatmap({
    sheet,
    year,
    onSelectDate,
    selectedDate,
}: HabitHeatmapProps) {
    const weeks = yearCalendarWeeks(year);

    // Label a week column with its month only when that month starts in it, so
    // each month is named once, above the week it begins.
    const monthLabels = weeks.map((week, index) => {
        const firstReal = week.find((d): d is string => d !== null);
        if (!firstReal) return null;
        const month = dayjs(firstReal).month();
        if (index === 0) return dayjs(firstReal).format("MMM");

        const previous = weeks[index - 1].find((d): d is string => d !== null);
        if (previous && dayjs(previous).month() !== month) {
            return dayjs(firstReal).format("MMM");
        }
        return null;
    });

    return (
        <div className="habit-heatmap">
            <div className="heatmap-scroll">
                <div className="heatmap-months">
                    {monthLabels.map((label, i) => (
                        <span key={i} className="heatmap-month">
                            {label ?? ""}
                        </span>
                    ))}
                </div>

                <div className="heatmap-body">
                    <div className="heatmap-weekdays">
                        {WEEKDAY_LABELS.map((label, i) => (
                            <span key={i} className="heatmap-weekday">
                                {label}
                            </span>
                        ))}
                    </div>

                    <div className="heatmap-weeks">
                        {weeks.map((week, weekIndex) => (
                            <div key={weekIndex} className="heatmap-week">
                                {week.map((date, dayIndex) => {
                                    if (date === null) {
                                        return (
                                            <span
                                                key={dayIndex}
                                                className="heatmap-square is-blank"
                                            />
                                        );
                                    }

                                    const stats = dayStats(sheet, date);
                                    const level = stats.possible === 0 ? 0 : heatLevel(stats.percent);
                                    return (
                                        <button
                                            key={dayIndex}
                                            type="button"
                                            className={`heatmap-square level-${level} ${
                                                date === selectedDate ? "is-selected" : ""
                                            }`}
                                            title={`${date}: ${stats.completed}/${stats.possible} habits`}
                                            aria-label={`${date}, ${stats.completed} of ${stats.possible} habits`}
                                            onClick={() => onSelectDate(date)}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="heatmap-legend">
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((level) => (
                    <span key={level} className={`heatmap-square level-${level}`} />
                ))}
                <span>More</span>
            </div>
        </div>
    );
}
