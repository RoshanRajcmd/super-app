import { invoke } from "@tauri-apps/api/core";
import type { Task, DailyStats } from "../types";

const TASKS_FILE = "./data/tasks.json";
const STATS_FILE = "./data/stats.json";

export async function loadTasks(): Promise<Task[]> {
    try {
        const content = await invoke<string>("read_file", { path: TASKS_FILE });
        return JSON.parse(content);
    } catch {
        return [];
    }
}

export async function saveTasks(tasks: Task[]): Promise<void> {
    await invoke("write_file", {
        path: TASKS_FILE,
        content: JSON.stringify(tasks, null, 2),
    });
}

export async function loadStats(): Promise<DailyStats[]> {
    try {
        const content = await invoke<string>("read_file", { path: STATS_FILE });
        return JSON.parse(content);
    } catch {
        return [];
    }
}

export async function saveStats(stats: DailyStats[]): Promise<void> {
    await invoke("write_file", {
        path: STATS_FILE,
        content: JSON.stringify(stats, null, 2),
    });
}

export async function updateDailyStats(tasks: Task[]): Promise<DailyStats[]> {
    const stats = await loadStats();
    const today = new Date().toISOString().split("T")[0];

    // Get today's stats
    const todayStats = stats.find((s) => s.date === today) || {
        date: today,
        total: 0,
        completed: 0,
    };

    // Count tasks for today
    const todayTasks = tasks.filter((t) => t.date === today);
    todayStats.total = todayTasks.length;
    todayStats.completed = todayTasks.filter((t) => t.completed).length;

    // Update or add today's stats
    const existingIndex = stats.findIndex((s) => s.date === today);
    if (existingIndex >= 0) {
        stats[existingIndex] = todayStats;
    } else {
        stats.push(todayStats);
    }

    await saveStats(stats);
    return stats;
}
