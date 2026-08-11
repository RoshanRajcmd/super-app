import { useEffect, useState } from "react";
import { MdChecklist } from "react-icons/md";
import AppHome from "./AppHome";
import ProgressTracker from "../components/ProgressTracker";
import { appById } from "../nav/apps";
import type { DailyStats } from "../types";
import { loadTasks, updateDailyStats } from "../utils/storage";
import { today } from "../utils/dateUtils";

interface TasksHomeProps {
    /** Enter the task list. */
    onOpen: () => void;
}

/**
 * Home page for the task manager: how the week, month and all of it are going,
 * with the list itself one tap away.
 *
 * Stats are recomputed from the stored tasks on mount rather than handed down,
 * so the numbers are right whether the user has just left the task list or is
 * opening the app cold.
 */
export default function TasksHome({ onOpen }: TasksHomeProps) {
    const [stats, setStats] = useState<DailyStats[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        loadTasks()
            .then(updateDailyStats)
            .then((loadedStats) => {
                if (active) setStats(loadedStats);
            })
            .catch((e) => {
                if (active) setError(`Couldn't load your task history: ${String(e)}`);
            });

        return () => {
            active = false;
        };
    }, []);

    return (
        <AppHome
            app={appById("tasks")}
            actions={
                <button className="app-btn" onClick={onOpen}>
                    <MdChecklist aria-hidden /> Open tasks
                </button>
            }
        >
            {error && <div className="home-error">{error}</div>}
            <ProgressTracker stats={stats} selectedDate={today()} />
        </AppHome>
    );
}
