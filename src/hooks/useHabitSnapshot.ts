import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type { HabitSheet } from "../types";
import { currentSheet } from "../utils/habitFile";
import { parseHabitBook } from "../utils/habitSheet";

/**
 * Read-only view of the habit sheet chosen on a previous run.
 *
 * The tracker itself keeps the parsed book in a ref so it can round-trip the CSV
 * byte-for-byte on save. Nothing here writes, so a plain snapshot of the
 * readable part is enough — which keeps the home page out of the tracker's
 * save/conflict machinery entirely.
 */
export interface HabitSnapshot {
    sheet: HabitSheet | null;
    loading: boolean;
    error: string | null;
}

export function useHabitSnapshot(): HabitSnapshot {
    const [sheet, setSheet] = useState<HabitSheet | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // The sheet is an external file, so reading it on mount is the intended use
    // of an effect.
    useEffect(() => {
        let active = true;

        currentSheet()
            .then((handle) => {
                if (!active || handle === null || handle.bytes === null) return;
                const parsed = parseHabitBook(handle.bytes, dayjs().year());
                setSheet(parsed.sheet);
            })
            .catch((e) => {
                if (active) setError(`Couldn't read your habit sheet: ${String(e)}`);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, []);

    return { sheet, loading, error };
}
