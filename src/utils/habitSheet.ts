import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { HabitRow, HabitSheet } from "../types";
import { ISO_DAY, daysInYear, toIsoDay } from "./dateUtils";
import { dayStats } from "./habitStats";

dayjs.extend(customParseFormat);

/**
 * Reading and writing the habit sheet, a single UTF-8 CSV file.
 *
 * Layout: row 1 is the header — column A holds the habit names, column B the
 * date each habit joined the routine, and every remaining column is one day.
 * Row 2 is the "Daily Progress %" row, holding that day's completion
 * percentage. Habits start at row 3, and the intersection of a habit and a day
 * is marked when that habit was completed that day.
 *
 * The progress row is derived, not authoritative: it is recomputed from the
 * marks on every save so a spreadsheet opened by hand shows the same numbers
 * the app does.
 *
 * Habit names may contain emoji, so the file is decoded and encoded as UTF-8
 * explicitly rather than byte-per-character, and written with a byte-order mark
 * so Excel also reads them as UTF-8.
 *
 * Everything here is pure — bytes in, bytes out, no I/O. See `habitFile.ts` for
 * the filesystem shell.
 */

const MARK = "x";
const HABIT_HEADER = "Habit";
const TRACKED_FROM_HEADER = "Tracked from";
/** Label in column A of the derived percentage row. */
const PROGRESS_LABEL = "Daily Progress %";
/** Where the progress row is written when the sheet has none. */
const PROGRESS_ROW_INDEX = 1;

/**
 * Header formats accepted when reading a sheet that was not created by us.
 *
 * Excel and Google Sheets write day columns in whichever of these the locale
 * favours — "2-Jan" is what a UK/Indian locale produces — so all of them are
 * tried before a header is given up on as not a date.
 */
const HEADER_FORMATS = [
    ISO_DAY,
    "YYYY/MM/DD",
    "DD-MM-YYYY",
    "DD/MM/YYYY",
    "D-M-YYYY",
    "D/M/YYYY",
    "D-MMM-YYYY",
    "D MMM YYYY",
    "DD-MMM-YYYY",
    "MMM D YYYY",
    "MMM D, YYYY",
    "MMMM D YYYY",
    "MMMM D, YYYY",
    "MMM D",
    "MMM-D",
    "D MMM",
    "D-MMM",
    "MMMM D",
    "D-MMMM",
];
/** Of those, the ones that pin down a year on their own. */
const DATED_FORMATS = HEADER_FORMATS.filter((f) => f.includes("YYYY"));

/** Day 0 of Excel's serial numbering, for sheets exported with raw serials. */
const SERIAL_EPOCH = "1899-12-30";
/** Serial range treated as a date: roughly 1954-2119, so "2025" stays a year. */
const SERIAL_MIN = 20000;
const SERIAL_MAX = 80000;

/**
 * A parsed sheet plus the coordinates needed to edit it in place.
 *
 * Edits are applied to the original grid rather than rebuilt from scratch, so
 * any extra columns, notes, or rows the user keeps in their file survive a round
 * trip.
 */
export interface HabitBook {
    /** The whole file as rows of cells, mutated in place by the editors below. */
    grid: string[][];
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
    /** Row holding the daily percentages. Never `null` after parsing. */
    progressRow: number | null;
    /** Column headers that could not be read as dates, for surfacing to the user. */
    unreadableHeaders: string[];
}

/**
 * Split CSV text into rows of cells, per RFC 4180.
 *
 * Handles quoted fields containing commas, doubled quotes, and either line
 * ending, because the file is expected to be edited in Excel or Google Sheets
 * between visits.
 */
function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    // A leading byte-order mark would otherwise become part of the first header.
    let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

    const endField = () => {
        row.push(field);
        field = "";
    };
    const endRow = () => {
        endField();
        rows.push(row);
        row = [];
    };

    for (; i < text.length; i++) {
        const ch = text[i];

        if (quoted) {
            if (ch !== '"') {
                field += ch;
            } else if (text[i + 1] === '"') {
                field += '"';
                i++;
            } else {
                quoted = false;
            }
            continue;
        }

        // A quote only opens a quoted field at the start of one; anywhere else
        // it is a literal character, which is what hand-edited files tend to do.
        if (ch === '"' && field === "") quoted = true;
        else if (ch === ",") endField();
        else if (ch === "\n") endRow();
        else if (ch === "\r") {
            endRow();
            if (text[i + 1] === "\n") i++;
        } else field += ch;
    }

    // A file ending in a newline leaves nothing pending; anything else is a
    // final row without a terminator.
    if (field !== "" || row.length > 0) endRow();

    return rows;
}

/**
 * Decode sheet bytes to text, working out the encoding first.
 *
 * A habit sheet is edited in Excel, Numbers and Google Sheets between visits,
 * and those write more than one encoding: UTF-8 with or without a byte-order
 * mark, UTF-16 for Excel's "Unicode Text", and a legacy single-byte page for
 * older "Save as CSV". Guessing wrong turns emoji in habit names into runs of
 * unrelated symbols, so the mark is honoured when present and UTF-8 is verified
 * strictly before being trusted.
 */
function decodeCsvBytes(bytes: Uint8Array): string {
    if (bytes.length >= 2) {
        if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
        if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
    }

    try {
        // Fatal, so invalid sequences throw rather than becoming U+FFFD and
        // silently losing the habit name they were part of.
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        // Not UTF-8 at all: a legacy single-byte export. windows-1252 covers the
        // punctuation those files carry that latin1 leaves undefined.
        return new TextDecoder("windows-1252").decode(bytes);
    }
}

/** True when every character fits in one byte, i.e. nothing above U+00FF. */
function isAllSingleByte(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) > 0xff) return false;
    }
    return true;
}

/**
 * True when `text` holds a UTF-8 lead byte followed by a continuation byte, read
 * as single-byte characters. Without this check plain ASCII would be re-decoded
 * for nothing.
 */
function looksLikeUtf8Pair(text: string): boolean {
    for (let i = 0; i < text.length - 1; i++) {
        const lead = text.charCodeAt(i);
        const next = text.charCodeAt(i + 1);
        if (lead >= 0xc2 && lead <= 0xf4 && next >= 0x80 && next <= 0xbf) return true;
    }
    return false;
}

/**
 * Undo a UTF-8 file that some earlier tool read as a single-byte encoding, which
 * is what leaves an emoji looking like "ð¥".
 *
 * Only attempted when every character is in the single-byte range: correctly
 * decoded text containing emoji has characters above U+00FF, so a healthy sheet
 * can never be touched by this. The repair is kept only if the bytes it implies
 * are valid UTF-8 that actually decodes to something outside that range.
 */
function repairMojibake(text: string): string {
    if (!isAllSingleByte(text)) return text;
    if (!looksLikeUtf8Pair(text)) return text;

    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);

    try {
        const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        // Kept only if it actually yields characters the mojibake was hiding.
        return isAllSingleByte(repaired) ? text : repaired;
    } catch {
        return text;
    }
}

function quoteField(value: string): string {
    if (!/[",\r\n]/.test(value) && value.trim() === value) return value;
    return `"${value.replace(/"/g, '""')}"`;
}

function serializeCsv(grid: string[][]): string {
    const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
    return grid
        .map((row) => {
            const padded = row.length === width ? row : [...row, ...Array(width - row.length).fill("")];
            return padded.map(quoteField).join(",");
        })
        .join("\r\n");
}

function cell(grid: string[][], row: number, col: number): string {
    return grid[row]?.[col] ?? "";
}

function setCell(grid: string[][], row: number, col: number, value: string): void {
    while (grid.length <= row) grid.push([]);
    const cells = grid[row];
    while (cells.length <= col) cells.push("");
    cells[col] = value;
}

function gridWidth(grid: string[][]): number {
    return grid.reduce((max, row) => Math.max(max, row.length), 0);
}

function isMarked(value: string): boolean {
    const v = value.trim().toLowerCase();
    return v !== "" && v !== "0" && v !== "false" && v !== "no" && v !== "-";
}

function isProgressLabel(value: string): boolean {
    return /^daily\s+progress\s*%?$/i.test(value.trim());
}

/**
 * Read a row-1 header cell as an ISO date.
 *
 * `year` supplies the missing piece for headers like "Mar 4" that omit it, so
 * pass `null` to accept only headers that carry their own year. Returns null
 * when the cell cannot be understood as a date at all.
 */
function resolveHeaderDate(value: string, year: number | null): string | null {
    const text = value.trim();
    if (text === "") return null;

    // A bare number in a date row is an Excel serial (days since 1899-12-30).
    if (/^\d+(\.\d+)?$/.test(text)) {
        const serial = Number(text);
        if (serial < SERIAL_MIN || serial > SERIAL_MAX) return null;
        return toIsoDay(dayjs(SERIAL_EPOCH, ISO_DAY, true).add(Math.floor(serial), "day"));
    }

    for (const format of year === null ? DATED_FORMATS : HEADER_FORMATS) {
        const d = dayjs(text, format, true);
        if (!d.isValid()) continue;
        // Formats without a year default to 2001 in dayjs; pin them to the sheet's year.
        const withYear = format.includes("YYYY") ? d : d.year(year as number);
        return toIsoDay(withYear);
    }
    return null;
}

function findTrackedFromColumn(header: string[]): number | null {
    for (let col = 1; col < header.length; col++) {
        if (header[col].trim().toLowerCase() === TRACKED_FROM_HEADER.toLowerCase()) return col;
    }
    return null;
}

/**
 * The year the file covers, taken from whichever headers name one outright.
 *
 * A CSV has no worksheet name to read the year off, so the dated headers decide
 * it and `preferredYear` only breaks ties for a sheet whose headers are all
 * year-less ("Mar 4").
 */
function inferYear(header: string[], skipColumn: number | null, preferredYear: number): number {
    const counts = new Map<number, number>();

    for (let col = 1; col < header.length; col++) {
        if (col === skipColumn) continue;
        const iso = resolveHeaderDate(header[col], null);
        if (iso === null) continue;
        const y = Number(iso.slice(0, 4));
        counts.set(y, (counts.get(y) ?? 0) + 1);
    }

    let best = preferredYear;
    let bestCount = 0;
    for (const [y, count] of counts) {
        if (count > bestCount) {
            best = y;
            bestCount = count;
        }
    }
    return best;
}

/**
 * Parse CSV bytes into an editable book.
 *
 * `preferredYear` is the year to assume for a sheet whose headers do not state
 * one; headers that do state a year win.
 */
export function parseHabitBook(bytes: Uint8Array, preferredYear: number): HabitBook {
    const grid = parseCsv(repairMojibake(decodeCsvBytes(bytes)));
    if (grid.length === 0) {
        throw new Error("This CSV file is empty.");
    }

    const header = grid[0];

    const trackedFromColumn = findTrackedFromColumn(header);
    const year = inferYear(header, trackedFromColumn, preferredYear);

    const dateColumns = new Map<string, number>();
    const unreadableHeaders: string[] = [];

    for (let col = 1; col < header.length; col++) {
        if (col === trackedFromColumn) continue;
        const raw = header[col];
        if (raw.trim() === "") continue;
        const iso = resolveHeaderDate(raw, year);
        if (iso === null) {
            unreadableHeaders.push(raw);
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
    let progressRow: number | null = null;

    for (let row = 1; row < grid.length; row++) {
        const name = cell(grid, row, 0).trim();
        if (name === "") continue;

        // The percentages are recomputed on save, so the row is remembered by
        // position and never treated as a habit.
        if (isProgressLabel(name)) {
            if (progressRow === null) progressRow = row;
            continue;
        }

        if (habitRows.has(name)) continue; // Duplicate habit name: keep the first row.

        const done = new Set<string>();
        for (const [iso, col] of dateColumns) {
            if (isMarked(cell(grid, row, col))) done.add(iso);
        }

        const declared = trackedFromColumn === null
            ? null
            : resolveHeaderDate(cell(grid, row, trackedFromColumn), year);
        // An unreadable or absent start date falls back to the sheet start, but
        // never later than the habit's own earliest mark — a day it was actually
        // completed must count.
        const earliestMark = done.size > 0 ? [...done].sort()[0] : null;
        let trackedFrom = declared ?? sheetStart;
        if (earliestMark !== null && earliestMark < trackedFrom) trackedFrom = earliestMark;

        habitRows.set(name, row);
        habits.push({ name, done, trackedFrom });
    }

    const book: HabitBook = {
        grid,
        sheet: { year, habits },
        dateColumns,
        habitRows,
        trackedFromColumn,
        progressRow,
        unreadableHeaders,
    };

    // Sheets written by hand or by an older version have no percentage row;
    // give them one now so every editor below can assume it exists.
    ensureProgressRow(book);
    return book;
}

/**
 * Build a fresh book: a header, the percentage row, then one row per habit,
 * with a column for every day of `year`.
 *
 * `trackedFrom` is the start date recorded for every seed habit — the day the
 * sheet was created, so earlier days in the year are not counted as missed.
 */
export function createHabitBook(year: number, habitNames: string[], trackedFrom: string): HabitBook {
    const days = daysInYear(year);
    const blanks = days.map(() => "");

    const grid: string[][] = [
        [HABIT_HEADER, TRACKED_FROM_HEADER, ...days],
        [PROGRESS_LABEL, "", ...blanks],
        ...habitNames.map((name) => [name, trackedFrom, ...blanks]),
    ];

    const dateColumns = new Map<string, number>();
    days.forEach((iso, i) => dateColumns.set(iso, i + 2));

    const habitRows = new Map<string, number>();
    const habits: HabitRow[] = habitNames.map((name, i) => {
        habitRows.set(name, i + 2);
        return { name, done: new Set<string>(), trackedFrom };
    });

    return {
        grid,
        sheet: { year, habits },
        dateColumns,
        habitRows,
        trackedFromColumn: 1,
        progressRow: PROGRESS_ROW_INDEX,
        unreadableHeaders: [],
    };
}

function addDateColumn(book: HabitBook, iso: string): number {
    // Past the last column in use, so an unreadable header the user cares about
    // is never overwritten.
    const col = gridWidth(book.grid);
    setCell(book.grid, 0, col, iso);
    book.dateColumns.set(iso, col);
    return col;
}

/**
 * Insert the percentage row, shifting the rows below it down.
 *
 * Sheets that predate the row get it in second place, where the app and the
 * spreadsheet both expect to find it.
 */
function ensureProgressRow(book: HabitBook): number {
    if (book.progressRow !== null) return book.progressRow;

    const at = Math.min(PROGRESS_ROW_INDEX, book.grid.length);
    book.grid.splice(at, 0, [PROGRESS_LABEL]);

    for (const [name, row] of book.habitRows) {
        if (row >= at) book.habitRows.set(name, row + 1);
    }

    book.progressRow = at;
    return at;
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

    const col = gridWidth(book.grid);
    setCell(book.grid, 0, col, TRACKED_FROM_HEADER);

    for (const habit of book.sheet.habits) {
        const row = book.habitRows.get(habit.name);
        if (row === undefined) continue;
        setCell(book.grid, row, col, habit.trackedFrom);
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

    ensureProgressRow(book);
    const startColumn = ensureTrackedFromColumn(book);
    const row = book.grid.length;

    setCell(book.grid, row, 0, trimmed);
    setCell(book.grid, row, startColumn, trackedFrom);

    book.habitRows.set(trimmed, row);
    book.sheet.habits.push({ name: trimmed, done: new Set<string>(), trackedFrom });
    return row;
}

/** Delete a habit's row and drop it from the in-memory sheet. */
export function removeHabit(book: HabitBook, name: string): void {
    const row = book.habitRows.get(name);
    if (row === undefined) return;

    book.grid.splice(row, 1);

    book.habitRows.delete(name);
    for (const [other, otherRow] of book.habitRows) {
        if (otherRow > row) book.habitRows.set(other, otherRow - 1);
    }
    if (book.progressRow !== null && book.progressRow > row) book.progressRow -= 1;

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
    setCell(book.grid, row, col, done ? MARK : "");

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
    setCell(book.grid, row, col, date);

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

    setCell(book.grid, row, 0, trimmed);
    book.habitRows.delete(from);
    book.habitRows.set(trimmed, row);

    const habit = book.sheet.habits.find((h) => h.name === from);
    if (habit) habit.name = trimmed;
}

/**
 * Recompute the "Daily Progress %" row from the current marks.
 *
 * Days with nothing tracked yet — the future, or before the first habit started
 * — are left blank rather than written as 0%, which would read as a failed day.
 */
export function refreshProgressRow(book: HabitBook): void {
    const row = ensureProgressRow(book);
    setCell(book.grid, row, 0, PROGRESS_LABEL);
    if (book.trackedFromColumn !== null) setCell(book.grid, row, book.trackedFromColumn, "");

    for (const [date, col] of book.dateColumns) {
        const { possible, percent } = dayStats(book.sheet, date);
        setCell(book.grid, row, col, possible > 0 ? String(Math.round(percent)) : "");
    }
}

/**
 * Serialize the book back to CSV bytes, percentages first.
 *
 * A byte-order mark is written so Excel opens the file as UTF-8 and shows emoji
 * in habit names instead of mojibake.
 */
export function serializeHabitBook(book: HabitBook): Uint8Array {
    refreshProgressRow(book);
    return new TextEncoder().encode(`\uFEFF${serializeCsv(book.grid)}\r\n`);
}
