import * as XLSX from "xlsx";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { HabitRow, HabitSheet } from "../types";
import { ISO_DAY, daysInYear, toIsoDay } from "./dateUtils";

dayjs.extend(customParseFormat);

/**
 * Reading and writing the habit spreadsheet.
 *
 * Layout: one worksheet per calendar year, named after the year. Column A holds
 * the daily-routine habit names, column B the date each habit joined the
 * routine, row 1 holds one date per remaining column, and the intersection is
 * marked when that habit was completed that day.
 *
 * Everything here is pure — bytes in, bytes out, no I/O. See `habitFile.ts` for
 * the filesystem shell.
 */

const MARK = "x";
const HABIT_HEADER = "Habit";
const TRACKED_FROM_HEADER = "Tracked from";

/** Header formats accepted when reading a sheet that was not created by us. */
const HEADER_FORMATS = [ISO_DAY, "YYYY/MM/DD", "DD-MM-YYYY", "DD/MM/YYYY", "MMM D", "D MMM", "MMMM D"];

/**
 * A parsed workbook plus the coordinates needed to edit it in place.
 *
 * Marks are written back into the original worksheet rather than rebuilt from
 * scratch, so any extra columns, notes, or rows the user keeps in their sheet
 * survive a round trip.
 */
export interface HabitBook {
    workbook: XLSX.WorkBook;
    sheetName: string;
    sheet: HabitSheet;
    /** ISO date -> column index (0-based). */
    dateColumns: Map<string, number>;
    /** Habit name -> row index (0-based). */
    habitRows: Map<string, number>;
    /**
     * Column holding each habit's start date, or `null` for a sheet that has
     * none (one written by hand, or by an older version of this app).
     */
    trackedFromColumn: number | null;
    /** Column headers that could not be read as dates, for surfacing to the user. */
    unreadableHeaders: string[];
}

function isMarked(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (value instanceof Date) return true;
    if (typeof value === "string") {
        const v = value.trim().toLowerCase();
        return v !== "" && v !== "0" && v !== "false" && v !== "no" && v !== "-";
    }
    return false;
}

/**
 * Read a row-1 header cell as an ISO date.
 *
 * `year` supplies the missing piece for headers like "Mar 4" that omit it.
 * Returns null when the cell cannot be understood as a date at all.
 */
function resolveHeaderDate(value: unknown, year: number): string | null {
    if (value === null || value === undefined || value === "") return null;

    if (value instanceof Date) return toIsoDay(dayjs(value));

    // A bare number in a date row is an Excel serial (days since 1899-12-30).
    if (typeof value === "number") {
        if (!Number.isFinite(value) || value <= 0) return null;
        const parsed = XLSX.SSF.parse_date_code(value);
        if (!parsed) return null;
        // parse_date_code yields unpadded parts (2025, 1, 6), which a strict
        // YYYY-MM-DD parse rejects, so pad before handing it to dayjs.
        const pad = (n: number) => String(n).padStart(2, "0");
        const d = dayjs(`${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`, ISO_DAY, true);
        return d.isValid() ? toIsoDay(d) : null;
    }

    if (typeof value !== "string") return null;
    const text = value.trim();
    if (text === "") return null;

    for (const format of HEADER_FORMATS) {
        const d = dayjs(text, format, true);
        if (!d.isValid()) continue;
        // Formats without a year default to 2001 in dayjs; pin them to the sheet's year.
        const withYear = format.includes("YYYY") ? d : d.year(year);
        return toIsoDay(withYear);
    }
    return null;
}

/** The worksheet to use: the one named for `preferredYear`, else the first. */
function pickSheetName(workbook: XLSX.WorkBook, preferredYear: number): string {
    const byYear = workbook.SheetNames.find((n) => n.trim() === String(preferredYear));
    return byYear ?? workbook.SheetNames[0];
}

/**
 * Parse `.xlsx` bytes into an editable book.
 *
 * `preferredYear` selects which worksheet to read when the workbook holds
 * several; the year is also used to interpret year-less date headers.
 */
export function parseHabitBook(bytes: Uint8Array, preferredYear: number): HabitBook {
    const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
    if (workbook.SheetNames.length === 0) {
        throw new Error("This spreadsheet has no worksheets.");
    }

    const sheetName = pickSheetName(workbook, preferredYear);
    const worksheet = workbook.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        blankrows: true,
        defval: null,
    });

    const yearFromName = Number(sheetName.trim());
    const year = Number.isInteger(yearFromName) ? yearFromName : preferredYear;

    const headerRow = grid[0] ?? [];

    // Locate the start-date column before reading dates, so it is not mistaken
    // for a day column.
    let trackedFromColumn: number | null = null;
    for (let col = 1; col < headerRow.length; col++) {
        const raw = headerRow[col];
        if (typeof raw === "string" && raw.trim().toLowerCase() === TRACKED_FROM_HEADER.toLowerCase()) {
            trackedFromColumn = col;
            break;
        }
    }

    const dateColumns = new Map<string, number>();
    const unreadableHeaders: string[] = [];

    for (let col = 1; col < headerRow.length; col++) {
        if (col === trackedFromColumn) continue;
        const raw = headerRow[col];
        if (raw === null || raw === undefined || raw === "") continue;
        const iso = resolveHeaderDate(raw, year);
        if (iso === null) {
            unreadableHeaders.push(String(raw));
            continue;
        }
        // First column wins if a date is duplicated, so marks stay in one place.
        if (!dateColumns.has(iso)) dateColumns.set(iso, col);
    }

    // Fallback for sheets with no start-date column: treat each habit as tracked
    // from the sheet's first day, which is how it behaved before the column
    // existed and is right for habits that were there from the start.
    const sheetStart = dateColumns.size > 0
        ? [...dateColumns.keys()].sort()[0]
        : `${year}-01-01`;

    const habits: HabitRow[] = [];
    const habitRows = new Map<string, number>();

    for (let row = 1; row < grid.length; row++) {
        const cells = grid[row] ?? [];
        const name = typeof cells[0] === "string" ? cells[0].trim() : cells[0] ? String(cells[0]).trim() : "";
        if (name === "") continue;
        if (habitRows.has(name)) continue; // Duplicate habit name: keep the first row.

        const done = new Set<string>();
        for (const [iso, col] of dateColumns) {
            if (isMarked(cells[col])) done.add(iso);
        }

        const declared = trackedFromColumn === null
            ? null
            : resolveHeaderDate(cells[trackedFromColumn], year);
        // An unreadable or absent start date falls back to the sheet start, but
        // never later than the habit's own earliest mark — a day it was actually
        // completed must count.
        const earliestMark = done.size > 0 ? [...done].sort()[0] : null;
        let trackedFrom = declared ?? sheetStart;
        if (earliestMark !== null && earliestMark < trackedFrom) trackedFrom = earliestMark;

        habitRows.set(name, row);
        habits.push({ name, done, trackedFrom });
    }

    return {
        workbook,
        sheetName,
        sheet: { year, habits },
        dateColumns,
        habitRows,
        trackedFromColumn,
        unreadableHeaders,
    };
}

/**
 * Build a fresh workbook: one worksheet for `year`, a column per day.
 *
 * `trackedFrom` is the start date recorded for every seed habit — the day the
 * sheet was created, so earlier days in the year are not counted as missed.
 */
export function createHabitBook(year: number, habitNames: string[], trackedFrom: string): HabitBook {
    const days = daysInYear(year);
    const header = [HABIT_HEADER, TRACKED_FROM_HEADER, ...days];
    const rows = habitNames.map((name) => [name, trackedFrom, ...days.map(() => "")]);

    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    // Keep the habit column visible while scrolling a year's worth of days.
    worksheet["!cols"] = [{ wch: 28 }, { wch: 12 }, ...days.map(() => ({ wch: 5 }))];
    worksheet["!freeze"] = { xSplit: "2", ySplit: "1" };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, String(year));

    // Column 1 is the start date, so day columns begin at 2.
    const dateColumns = new Map<string, number>();
    days.forEach((iso, i) => dateColumns.set(iso, i + 2));

    const habitRows = new Map<string, number>();
    const habits: HabitRow[] = habitNames.map((name, i) => {
        habitRows.set(name, i + 1);
        return { name, done: new Set<string>(), trackedFrom };
    });

    return {
        workbook,
        sheetName: String(year),
        sheet: { year, habits },
        dateColumns,
        habitRows,
        trackedFromColumn: 1,
        unreadableHeaders: [],
    };
}

/** Grow the worksheet's declared range so it covers `row`/`col`. */
function extendRange(worksheet: XLSX.WorkSheet, row: number, col: number): void {
    const ref = worksheet["!ref"];
    const range: XLSX.Range = ref
        ? XLSX.utils.decode_range(ref)
        : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };

    range.e.r = Math.max(range.e.r, row);
    range.e.c = Math.max(range.e.c, col);
    worksheet["!ref"] = XLSX.utils.encode_range(range);
}

function activeSheet(book: HabitBook): XLSX.WorkSheet {
    return book.workbook.Sheets[book.sheetName];
}

/** Append a date column for `iso` and return its index. */
function addDateColumn(book: HabitBook, iso: string): number {
    const worksheet = activeSheet(book);
    const used = [...book.dateColumns.values()];
    const highest = Math.max(
        used.length > 0 ? Math.max(...used) : 0,
        book.trackedFromColumn ?? 0
    );
    const col = highest + 1;

    worksheet[XLSX.utils.encode_cell({ r: 0, c: col })] = { t: "s", v: iso };
    extendRange(worksheet, 0, col);
    book.dateColumns.set(iso, col);
    return col;
}

/**
 * Add the start-date column to a sheet that predates it, and backfill every
 * existing habit with the sheet's first day.
 *
 * Those habits have unknown history, so treating them as tracked from the start
 * preserves the scores the user already saw.
 */
function ensureTrackedFromColumn(book: HabitBook): number {
    if (book.trackedFromColumn !== null) return book.trackedFromColumn;

    const worksheet = activeSheet(book);
    const usedDates = [...book.dateColumns.values()];
    const col = (usedDates.length > 0 ? Math.max(...usedDates) : 0) + 1;

    worksheet[XLSX.utils.encode_cell({ r: 0, c: col })] = { t: "s", v: TRACKED_FROM_HEADER };
    extendRange(worksheet, 0, col);

    for (const habit of book.sheet.habits) {
        const row = book.habitRows.get(habit.name);
        if (row === undefined) continue;
        worksheet[XLSX.utils.encode_cell({ r: row, c: col })] = { t: "s", v: habit.trackedFrom };
        extendRange(worksheet, row, col);
    }

    book.trackedFromColumn = col;
    return col;
}

/**
 * Add a habit as a new bottom row, tracked from `trackedFrom` onwards.
 *
 * Recording the start date is what stops a habit added today from making every
 * earlier day look incomplete. No-op if the name is already present; returns the
 * row index.
 */
export function addHabit(book: HabitBook, name: string, trackedFrom: string): number {
    const trimmed = name.trim();
    if (trimmed === "") throw new Error("A habit needs a name.");

    const existing = book.habitRows.get(trimmed);
    if (existing !== undefined) return existing;

    const worksheet = activeSheet(book);
    const startColumn = ensureTrackedFromColumn(book);
    const used = [...book.habitRows.values()];
    const row = (used.length > 0 ? Math.max(...used) : 0) + 1;

    worksheet[XLSX.utils.encode_cell({ r: row, c: 0 })] = { t: "s", v: trimmed };
    worksheet[XLSX.utils.encode_cell({ r: row, c: startColumn })] = { t: "s", v: trackedFrom };
    extendRange(worksheet, row, Math.max(0, startColumn));

    book.habitRows.set(trimmed, row);
    book.sheet.habits.push({ name: trimmed, done: new Set<string>(), trackedFrom });
    return row;
}

/** Remove a habit's row contents and drop it from the in-memory sheet. */
export function removeHabit(book: HabitBook, name: string): void {
    const row = book.habitRows.get(name);
    if (row === undefined) return;

    const worksheet = activeSheet(book);
    // Clear the row in place. Deleting it outright would shift every row below,
    // invalidating the cached indices for the other habits.
    delete worksheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
    if (book.trackedFromColumn !== null) {
        delete worksheet[XLSX.utils.encode_cell({ r: row, c: book.trackedFromColumn })];
    }
    for (const col of book.dateColumns.values()) {
        delete worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
    }

    book.habitRows.delete(name);
    book.sheet.habits = book.sheet.habits.filter((h) => h.name !== name);
}

/**
 * Mark or unmark one habit on one day, creating the column if the sheet does
 * not have it yet.
 */
export function setMark(book: HabitBook, habitName: string, date: string, done: boolean): void {
    const row = book.habitRows.get(habitName);
    if (row === undefined) throw new Error(`Unknown habit: ${habitName}`);

    const col = book.dateColumns.get(date) ?? addDateColumn(book, date);
    const worksheet = activeSheet(book);
    const address = XLSX.utils.encode_cell({ r: row, c: col });

    if (done) {
        worksheet[address] = { t: "s", v: MARK };
        extendRange(worksheet, row, col);
    } else {
        delete worksheet[address];
    }

    const habit = book.sheet.habits.find((h) => h.name === habitName);
    if (habit) {
        if (done) habit.done.add(date);
        else habit.done.delete(date);

        // Ticking a day earlier than the recorded start means the habit really
        // was part of the routine then, so move the start back to match.
        if (done && date < habit.trackedFrom) {
            setTrackedFrom(book, habitName, date);
        }
    }
}

/** Record the first day a habit counts towards scores. */
export function setTrackedFrom(book: HabitBook, habitName: string, date: string): void {
    const row = book.habitRows.get(habitName);
    if (row === undefined) throw new Error(`Unknown habit: ${habitName}`);

    const col = ensureTrackedFromColumn(book);
    const worksheet = activeSheet(book);
    worksheet[XLSX.utils.encode_cell({ r: row, c: col })] = { t: "s", v: date };
    extendRange(worksheet, row, col);

    const habit = book.sheet.habits.find((h) => h.name === habitName);
    if (habit) habit.trackedFrom = date;
}

/** Rename a habit in column A. */
export function renameHabit(book: HabitBook, from: string, to: string): void {
    const trimmed = to.trim();
    if (trimmed === "") throw new Error("A habit needs a name.");
    if (trimmed === from) return;
    if (book.habitRows.has(trimmed)) throw new Error(`"${trimmed}" already exists.`);

    const row = book.habitRows.get(from);
    if (row === undefined) throw new Error(`Unknown habit: ${from}`);

    activeSheet(book)[XLSX.utils.encode_cell({ r: row, c: 0 })] = { t: "s", v: trimmed };
    book.habitRows.delete(from);
    book.habitRows.set(trimmed, row);

    const habit = book.sheet.habits.find((h) => h.name === from);
    if (habit) habit.name = trimmed;
}

/** Serialize the book back to `.xlsx` bytes. */
export function serializeHabitBook(book: HabitBook): Uint8Array {
    const out = XLSX.write(book.workbook, { type: "array", bookType: "xlsx" });
    return new Uint8Array(out as ArrayBuffer);
}
