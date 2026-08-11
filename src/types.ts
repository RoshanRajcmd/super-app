export interface Task {
    id: string;
    title: string;
    description: string;
    date: string; // YYYY-MM-DD
    time?: string; // HH:mm
    location?: string;
    meetingLink?: string;
    completed: boolean;
    createdAt: string;
}

export interface DailyStats {
    date: string; // YYYY-MM-DD
    total: number;
    completed: number;
}

export interface AppState {
    currentApp: 'notes' | 'todos' | 'habits';
}

/** One daily-routine row of the habit spreadsheet. */
export interface HabitRow {
    /** Habit name, from column A. */
    name: string;
    /** ISO dates (YYYY-MM-DD) this habit was completed on. */
    done: Set<string>;
    /**
     * First day (YYYY-MM-DD) this habit counted towards a score.
     *
     * A habit added today was not part of the routine last month, so it must not
     * drag last month's percentage down. Days before this date ignore the habit
     * entirely rather than counting it as missed.
     */
    trackedFrom: string;
}

/**
 * The habit spreadsheet as the app understands it: one worksheet per year,
 * habits down column A and one column per day of that year.
 */
export interface HabitSheet {
    /** Calendar year the sheet's active worksheet covers. */
    year: number;
    habits: HabitRow[];
}

/** Completion counts over an arbitrary span of days. */
export interface PeriodStats {
    /** Habit-days marked complete in the span. */
    completed: number;
    /**
     * Habit-days that could have been completed. For a span that includes the
     * future, only days up to today count, so an in-progress week is not
     * penalised for days that have not happened yet.
     */
    possible: number;
    /** `completed / possible` as 0-100, or 0 when nothing is possible yet. */
    percent: number;
}

/** Which slice of the sheet the habit tracker is showing. */
export type HabitViewMode = 'day' | 'week' | 'month' | 'year';
