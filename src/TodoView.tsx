import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Task, DailyStats } from "./types";
import { loadTasks, saveTasks, updateDailyStats } from "./utils/storage";
import { formatDate } from "./utils/dateUtils";
import TaskForm from "./components/TaskForm";
import TaskList from "./components/TaskList";
import ProgressTracker from "./components/ProgressTracker";
import "./styles/TodoView.css";

interface TodoViewProps {
    onBack: () => void;
}

export default function TodoView({ onBack }: TodoViewProps) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [stats, setStats] = useState<DailyStats[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [selectedDate, setSelectedDate] = useState(
        new Date().toISOString().split("T")[0]
    );

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            const loadedTasks = await loadTasks();
            setTasks(loadedTasks);

            const loadedStats = await updateDailyStats(loadedTasks);
            setStats(loadedStats);
        } catch (error) {
            console.error("Failed to load tasks:", error);
        }
    }

    async function addTask(taskData: Omit<Task, "id" | "createdAt">) {
        const newTask: Task = {
            ...taskData,
            id: uuidv4(),
            createdAt: new Date().toISOString(),
        };

        const updatedTasks = [...tasks, newTask];
        setTasks(updatedTasks);
        await saveTasks(updatedTasks);

        const updatedStats = await updateDailyStats(updatedTasks);
        setStats(updatedStats);
        setShowForm(false);
    }

    async function updateTask(id: string, updates: Partial<Task>) {
        const updatedTasks = tasks.map((t) => (t.id === id ? { ...t, ...updates } : t));
        setTasks(updatedTasks);
        await saveTasks(updatedTasks);

        const updatedStats = await updateDailyStats(updatedTasks);
        setStats(updatedStats);
    }

    async function deleteTask(id: string) {
        const updatedTasks = tasks.filter((t) => t.id !== id);
        setTasks(updatedTasks);
        await saveTasks(updatedTasks);

        const updatedStats = await updateDailyStats(updatedTasks);
        setStats(updatedStats);
    }

    const todayTasks = tasks.filter((t) => t.date === selectedDate);
    const completedCount = todayTasks.filter((t) => t.completed).length;
    const totalCount = todayTasks.length;

    return (
        <div className="todo-view">
            <div className="todo-header">
                <button className="back-btn" onClick={onBack}>
                    ← Back
                </button>
                <h1>✓ Task Manager</h1>
                <button
                    className="add-task-btn"
                    onClick={() => setShowForm(!showForm)}
                >
                    + Add Task
                </button>
            </div>

            {showForm && (
                <TaskForm
                    onAdd={addTask}
                    onCancel={() => setShowForm(false)}
                    defaultDate={selectedDate}
                />
            )}

            <ProgressTracker stats={stats} selectedDate={selectedDate} />

            <div className="todo-container">
                <div className="daily-section">
                    <div className="date-selector">
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                        />
                        <span className="date-label">{formatDate(selectedDate)}</span>
                    </div>

                    <div className="daily-progress">
                        <div className="progress-info">
                            <span>Tasks Today: {completedCount} / {totalCount}</span>
                        </div>
                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{
                                    width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
                                }}
                            />
                        </div>
                    </div>

                    <TaskList
                        tasks={todayTasks}
                        onToggleComplete={(id, completed) =>
                            updateTask(id, { completed })
                        }
                        onDelete={deleteTask}
                        onUpdate={updateTask}
                    />
                </div>
            </div>
        </div>
    );
}
