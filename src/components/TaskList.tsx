import type { Task } from "../types";
import { formatTime } from "../utils/dateUtils";

interface TaskListProps {
    tasks: Task[];
    onToggleComplete: (id: string, completed: boolean) => void;
    onDelete: (id: string) => void;
    onUpdate: (id: string, updates: Partial<Task>) => void;
}

export default function TaskList({
    tasks,
    onToggleComplete,
    onDelete,
}: TaskListProps) {
    if (tasks.length === 0) {
        return <div className="empty-state">No tasks for this day. Great job! 🎉</div>;
    }

    return (
        <div className="task-list">
            {tasks.map((task) => (
                <div key={task.id} className={`task-item ${task.completed ? "completed" : ""}`}>
                    <div className="task-checkbox">
                        <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={(e) => onToggleComplete(task.id, e.target.checked)}
                            id={`task-${task.id}`}
                        />
                        <label htmlFor={`task-${task.id}`} />
                    </div>

                    <div className="task-content">
                        <div className="task-title">{task.title}</div>
                        {task.description && (
                            <div className="task-description">{task.description}</div>
                        )}
                        <div className="task-meta">
                            {task.time && (
                                <span className="meta-item">
                                    🕐 {formatTime(task.time)}
                                </span>
                            )}
                            {task.location && (
                                <span className="meta-item">📍 {task.location}</span>
                            )}
                            {task.meetingLink && (
                                <a
                                    href={task.meetingLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="meta-item"
                                >
                                    🔗 Meeting
                                </a>
                            )}
                        </div>
                    </div>

                    <button
                        className="delete-btn"
                        onClick={() => {
                            if (confirm("Delete this task?")) {
                                onDelete(task.id);
                            }
                        }}
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}
