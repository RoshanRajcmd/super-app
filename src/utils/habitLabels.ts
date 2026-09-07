import type { HabitDayType } from "../types";

/**
 * Wording for the `DayType` values, shared so the grid, the day list and the
 * setup screen all name a habit's days the same way.
 *
 * The sheet stores lowercase keywords; people read "Weekends".
 */
export function dayTypeLabel(dayType: HabitDayType): string {
    switch (dayType) {
        case "weekend":
            return "Weekends";
        case "weekday":
            return "Weekdays";
        default:
            return "Every day";
    }
}

/** The three choices in the order they are offered, `both` first as the default. */
export const DAY_TYPE_CHOICES: HabitDayType[] = ["both", "weekday", "weekend"];
