import type { DailyStats } from "../types";
import { getWeekRange, getMonthRange } from "../utils/dateUtils";

interface ProgressTrackerProps {
    stats: DailyStats[];
    selectedDate: string;
}

export default function ProgressTracker({ stats, selectedDate }: ProgressTrackerProps) {
    const weekRange = getWeekRange(selectedDate);
    const monthRange = getMonthRange(selectedDate);

    // Get week stats
    const weekStats = stats.filter(
        (s) => s.date >= weekRange.start && s.date <= weekRange.end
    );
    const weekCompleted = weekStats.reduce((sum, s) => sum + s.completed, 0);
    const weekTotal = weekStats.reduce((sum, s) => sum + s.total, 0);

    // Get month stats
    const monthStats = stats.filter(
        (s) => s.date >= monthRange.start && s.date <= monthRange.end
    );
    const monthCompleted = monthStats.reduce((sum, s) => sum + s.completed, 0);
    const monthTotal = monthStats.reduce((sum, s) => sum + s.total, 0);

    // Get all time stats
    const allCompleted = stats.reduce((sum, s) => sum + s.completed, 0);
    const allTotal = stats.reduce((sum, s) => sum + s.total, 0);

    return (
        <div className="progress-tracker">
            <h2>📊 Progress Overview</h2>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">This Week</div>
                    <div className="stat-value">
                        {weekCompleted} / {weekTotal}
                    </div>
                    <div className="stat-bar">
                        <div
                            className="stat-fill"
                            style={{
                                width: `${weekTotal > 0 ? (weekCompleted / weekTotal) * 100 : 0}%`,
                            }}
                        />
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">This Month</div>
                    <div className="stat-value">
                        {monthCompleted} / {monthTotal}
                    </div>
                    <div className="stat-bar">
                        <div
                            className="stat-fill"
                            style={{
                                width: `${monthTotal > 0 ? (monthCompleted / monthTotal) * 100 : 0}%`,
                            }}
                        />
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">All Time</div>
                    <div className="stat-value">
                        {allCompleted} / {allTotal}
                    </div>
                    <div className="stat-bar">
                        <div
                            className="stat-fill"
                            style={{
                                width: `${allTotal > 0 ? (allCompleted / allTotal) * 100 : 0}%`,
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* GitHub-style heatmap for the week */}
            <div className="week-heatmap">
                <h3>Week Activity</h3>
                <div className="heatmap">
                    {weekStats.map((stat) => {
                        const date = new Date(stat.date);
                        const dayName = date.toLocaleDateString("en-US", {
                            weekday: "short",
                        });
                        const completion =
                            stat.total > 0 ? (stat.completed / stat.total) * 100 : 0;

                        const intensity =
                            completion === 0
                                ? "no-activity"
                                : completion < 50
                                    ? "low"
                                    : completion < 100
                                        ? "medium"
                                        : "high";

                        return (
                            <div
                                key={stat.date}
                                className={`heatmap-cell ${intensity}`}
                                title={`${dayName}: ${stat.completed}/${stat.total}`}
                            >
                                <span className="cell-text">{stat.completed}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
