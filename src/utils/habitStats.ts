import type { HabitRow, HabitSheet, PeriodStats } from "../types";
import { daysInRange, isFuture, isWeekend, today } from "./dateUtils";

/**
 * Aggregation over a parsed habit sheet. Pure functions only — the same sheet
 * always yields the same numbers, which keeps the progress bars testable
 * independently of the spreadsheet or the UI.
 *
 * Every count here respects each habit's `trackedFrom` date and `dayType`: a
 * habit added today was not part of the routine last month, and a weekend-only
 * habit was never due on a Tuesday. Neither counts towards nor against a day it
 * does not apply to, so adding a habit never changes a past day's percentage and
 * a weekend chore never drags a weekday score down.
 */

/** Does `habit`'s `dayType` cover this day of the week? */
export function appliesOnDayType(habit: HabitRow, date: string): boolean {
    if (habit.dayType === "both") return true;
    return habit.dayType === (isWeekend(date) ? "weekend" : "weekday");
}

/** Was this habit part of the routine on `date`, and due on that kind of day? */
function wasTracked(habit: HabitRow, date: string): boolean {
    return date >= habit.trackedFrom && appliesOnDayType(habit, date);
}

/** Habits completed on `date`, out of the habits tracked on that date. */
export function dayStats(sheet: HabitSheet, date: string): PeriodStats {
    // A future day has nothing to complete yet, so it reads 0/0 rather than 0/N.
    if (isFuture(date)) {
        const completed = sheet.habits.filter((h) => h.done.has(date)).length;
        return { completed, possible: 0, percent: 0 };
    }

    const tracked = sheet.habits.filter((h) => wasTracked(h, date));
    const completed = tracked.filter((h) => h.done.has(date)).length;
    const possible = tracked.length;

    return {
        completed,
        possible,
        percent: possible > 0 ? (completed / possible) * 100 : 0,
    };
}

/**
 * Habit-days completed across `start`..`end` inclusive.
 *
 * Future days contribute nothing to `possible`, so an in-progress week or month
 * reports how well the days so far went, not how far it is from a full month.
 */
export function rangeStats(sheet: HabitSheet, start: string, end: string): PeriodStats {
    let completed = 0;
    let possible = 0;

    for (const date of daysInRange(start, end)) {
        if (isFuture(date)) continue;
        for (const habit of sheet.habits) {
            if (!wasTracked(habit, date)) continue;
            possible++;
            if (habit.done.has(date)) completed++;
        }
    }

    return {
        completed,
        possible,
        percent: possible > 0 ? (completed / possible) * 100 : 0,
    };
}

/** Per-day completion percentages for `dates`, for heatmaps and grids. */
export function dailyPercents(sheet: HabitSheet, dates: string[]): Map<string, number> {
    const percents = new Map<string, number>();
    for (const date of dates) {
        percents.set(date, dayStats(sheet, date).percent);
    }
    return percents;
}

/**
 * Heat level 0-4 for a completion percentage, matching the commit-graph look.
 *
 * Level 0 is "nothing done"; any progress at all reaches level 1, so a day with
 * one habit out of many does not render as an empty square.
 */
export function heatLevel(percent: number): 0 | 1 | 2 | 3 | 4 {
    if (percent <= 0) return 0;
    if (percent < 40) return 1;
    if (percent < 70) return 2;
    if (percent < 100) return 3;
    return 4;
}

/**
 * Consecutive days ending today (or yesterday) where every tracked habit was
 * completed.
 *
 * Today is excluded from breaking the streak when it is still incomplete, so an
 * unfinished morning does not appear to reset the run.
 */
export function perfectDayStreak(sheet: HabitSheet, from: string = today()): number {
    if (sheet.habits.length === 0) return 0;

    const yearStart = `${sheet.year}-01-01`;
    const days = daysInRange(yearStart, from).reverse();

    let streak = 0;
    for (const [index, date] of days.entries()) {
        const { completed, possible } = dayStats(sheet, date);
        const perfect = possible > 0 && completed === possible;
        if (perfect) {
            streak++;
            continue;
        }
        // An incomplete today is still in progress; keep counting backwards.
        if (index === 0) continue;
        break;
    }
    return streak;
}

/**
 * Per-habit completion counts over a range.
 *
 * `possible` counts only the days in the range on or after each habit's start
 * date, so a habit added midweek reads 2/2 rather than 2/7.
 */
export function habitTotals(
    sheet: HabitSheet,
    start: string,
    end: string
): { name: string; completed: number; possible: number }[] {
    const dates = daysInRange(start, end).filter((d) => !isFuture(d));
    return sheet.habits.map((habit) => {
        const eligible = dates.filter((d) => wasTracked(habit, d));
        return {
            name: habit.name,
            completed: eligible.filter((d) => habit.done.has(d)).length,
            possible: eligible.length,
        };
    });
}
