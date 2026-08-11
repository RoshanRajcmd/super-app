import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { IoChevronBackCircle } from "react-icons/io5";
import type { Task } from "./types";
import { loadTasks, saveTasks, updateDailyStats } from "./utils/storage";
import { formatDate } from "./utils/dateUtils";
import SidebarButton from "./components/SidebarButton";
import TaskForm from "./components/TaskForm";
import TaskList from "./components/TaskList";
import "./styles/TodoView.css";

interface TodoViewProps {
    onBack: () => void;
}

export default function TodoView({ onBack }: TodoViewProps) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [selectedDate, setSelectedDate] = useState(
        new Date().toISOString().split("T")[0]
    );

    // Hydrate from the persistent store once on mount. The store is an
    // external system, so reading it here is the intended use of an effect.
    useEffect(() => {
        let active = true;

        loadTasks()
            .then(async (loadedTasks) => {
                if (!active) return;
                setTasks(loadedTasks);
                // Nothing here renders the history, but the home page reads it,
                // so today's row is kept current from the moment tasks load.
                await updateDailyStats(loadedTasks);
            })
            .catch((error) => {
                console.error("Failed to load tasks:", error);
            });

        return () => {
            active = false;
        };
    }, []);

    async function addTask(taskData: Omit<Task, "id" | "createdAt">) {
        const newTask: Task = {
            ...taskData,
            id: uuidv4(),
            createdAt: new Date().toISOString(),
        };

        const updatedTasks = [...tasks, newTask];
        setTasks(updatedTasks);
        await saveTasks(updatedTasks);

        await updateDailyStats(updatedTasks);
        setShowForm(false);
    }

    async function updateTask(id: string, updates: Partial<Task>) {
        const updatedTasks = tasks.map((t) => (t.id === id ? { ...t, ...updates } : t));
        setTasks(updatedTasks);
        await saveTasks(updatedTasks);

        await updateDailyStats(updatedTasks);
    }

    async function deleteTask(id: string) {
        const updatedTasks = tasks.filter((t) => t.id !== id);
        setTasks(updatedTasks);
        await saveTasks(updatedTasks);

        await updateDailyStats(updatedTasks);
    }

    const todayTasks = tasks.filter((t) => t.date === selectedDate);
    const completedCount = todayTasks.filter((t) => t.completed).length;
    const totalCount = todayTasks.length;

    return (
        <div className="todo-view">
            <div className="todo-header">
                <SidebarButton />
                <button
                    className="back-btn icon-btn"
                    onClick={onBack}
                    aria-label="Back"
                    title="Back"
                >
                    <IoChevronBackCircle aria-hidden />
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
