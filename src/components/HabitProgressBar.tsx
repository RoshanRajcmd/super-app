import type { PeriodStats } from "../types";

interface HabitProgressBarProps {
    label: string;
    stats: PeriodStats;
    /** Larger treatment, for the headline bar of the current view. */
    prominent?: boolean;
}

/** One labelled completion bar, filled in a single green up to the percentage. */
export default function HabitProgressBar({ label, stats, prominent }: HabitProgressBarProps) {
    const empty = stats.possible === 0;

    return (
        <div className={`habit-progress ${prominent ? "prominent" : ""}`}>
            <div className="habit-progress-head">
                <span className="habit-progress-label">{label}</span>
                <span className="habit-progress-value">
                    {empty ? "—" : `${stats.completed}/${stats.possible} · ${Math.round(stats.percent)}%`}
                </span>
            </div>
            <div
                className="habit-progress-track"
                role="progressbar"
                aria-label={label}
                aria-valuenow={Math.round(stats.percent)}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div
                    className="habit-progress-fill"
                    style={{ width: `${Math.min(100, stats.percent)}%` }}
                />
            </div>
        </div>
    );
}
