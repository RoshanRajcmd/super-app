import type { HabitDayType } from "../types";
import { DAY_TYPE_CHOICES, dayTypeLabel } from "../utils/habitLabels";

interface DayTypeSelectProps {
    value: HabitDayType;
    onChange: (dayType: HabitDayType) => void;
    disabled?: boolean;
    /** Screen-reader name; the control is a bare select with no visible label. */
    label?: string;
}

/**
 * Picks which days a habit applies to, writing the sheet's `DayType` column.
 *
 * A native `<select>` because it is the one control that is comfortable both
 * with a mouse and as a phone's wheel picker.
 */
export default function DayTypeSelect({
    value,
    onChange,
    disabled,
    label = "Days this habit applies to",
}: DayTypeSelectProps) {
    return (
        <select
            className="day-type-select"
            aria-label={label}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value as HabitDayType)}
        >
            {DAY_TYPE_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                    {dayTypeLabel(choice)}
                </option>
            ))}
        </select>
    );
}
