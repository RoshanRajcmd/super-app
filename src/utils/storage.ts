import { getStore } from "./keyValueStore";
import type { Task, DailyStats } from "../types";

const TASKS_KEY = "tasks";
const STATS_KEY = "stats";
const NOTE_KEY = "note";

const DEFAULT_NOTE = "# New Note\n\nStart writing...";

export async function loadTasks(): Promise<Task[]> {
    const tasks = await getStore().get<Task[]>(TASKS_KEY);
    return tasks ?? [];
}

export async function saveTasks(tasks: Task[]): Promise<void> {
    await getStore().set(TASKS_KEY, tasks);
}

export async function loadStats(): Promise<DailyStats[]> {
    const stats = await getStore().get<DailyStats[]>(STATS_KEY);
    return stats ?? [];
}

export async function saveStats(stats: DailyStats[]): Promise<void> {
    await getStore().set(STATS_KEY, stats);
}

export async function loadNote(): Promise<string> {
    const note = await getStore().get<string>(NOTE_KEY);
    return note ?? DEFAULT_NOTE;
}

export async function saveNote(content: string): Promise<void> {
    await getStore().set(NOTE_KEY, content);
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
