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
