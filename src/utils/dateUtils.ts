import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

export function getWeekRange(date: string): { start: string; end: string } {
    const d = dayjs(date);
    const start = d.startOf("week").format("YYYY-MM-DD");
    const end = d.endOf("week").format("YYYY-MM-DD");
    return { start, end };
}

export function getMonthRange(date: string): { start: string; end: string } {
    const d = dayjs(date);
    const start = d.startOf("month").format("YYYY-MM-DD");
    const end = d.endOf("month").format("YYYY-MM-DD");
    return { start, end };
}

export function getYearRange(date: string): { start: string; end: string } {
    const d = dayjs(date);
    const start = d.startOf("year").format("YYYY-MM-DD");
    const end = d.endOf("year").format("YYYY-MM-DD");
    return { start, end };
}

export function getWeekNumber(date: string): number {
    return dayjs(date).week();
}

export function getMonth(date: string): number {
    return dayjs(date).month();
}

export function getYear(date: string): number {
    return dayjs(date).year();
}

export function formatDate(date: string): string {
    return dayjs(date).format("MMM DD, YYYY");
}

export function formatTime(time?: string): string {
    if (!time) return "";
    return dayjs("2000-01-01 " + time).format("h:mm A");
}

/** Canonical wire/storage format for a day. */
export const ISO_DAY = "YYYY-MM-DD";

export function toIsoDay(date: dayjs.Dayjs): string {
    return date.format(ISO_DAY);
}

export function today(): string {
    return dayjs().format(ISO_DAY);
}

/**
 * Monday-to-Sunday range containing `date`.
 *
 * Distinct from `getWeekRange`, which uses dayjs' locale-dependent week start.
 * The habit grid needs a fixed start so column positions stay stable.
 */
export function getIsoWeekRange(date: string): { start: string; end: string } {
    const d = dayjs(date);
    return {
        start: d.startOf("isoWeek").format(ISO_DAY),
        end: d.endOf("isoWeek").format(ISO_DAY),
    };
}

/** Every day from `start` to `end` inclusive, as ISO strings. */
export function daysInRange(start: string, end: string): string[] {
    const last = dayjs(end);
    const days: string[] = [];
    for (let d = dayjs(start); !d.isAfter(last, "day"); d = d.add(1, "day")) {
        days.push(d.format(ISO_DAY));
    }
    return days;
}

/** Every day of `year`, accounting for leap years. */
export function daysInYear(year: number): string[] {
    const start = dayjs(`${year}-01-01`);
    return daysInRange(start.format(ISO_DAY), start.endOf("year").format(ISO_DAY));
}

/**
 * `year` laid out as GitHub's contribution graph: one inner array per ISO week,
 * each holding exactly 7 slots from Monday to Sunday. Slots before the first of
 * January and after the last of December are `null` so the grid stays aligned.
 */
export function yearCalendarWeeks(year: number): (string | null)[][] {
    const firstDay = dayjs(`${year}-01-01`);
    const lastDay = firstDay.endOf("year");
    const gridStart = firstDay.startOf("isoWeek");
    const gridEnd = lastDay.endOf("isoWeek");

    const weeks: (string | null)[][] = [];
    let week: (string | null)[] = [];

    for (let d = gridStart; !d.isAfter(gridEnd, "day"); d = d.add(1, "day")) {
        week.push(d.year() === year ? d.format(ISO_DAY) : null);
        if (week.length === 7) {
            weeks.push(week);
            week = [];
        }
    }
    if (week.length > 0) weeks.push(week);

    return weeks;
}

export function formatDayShort(date: string): string {
    return dayjs(date).format("ddd D");
}

export function formatMonthYear(date: string): string {
    return dayjs(date).format("MMMM YYYY");
}

export function isFuture(date: string): boolean {
    return dayjs(date).isAfter(dayjs(), "day");
}
