import { useState } from "react";
import type { Task } from "../types";

interface TaskFormProps {
    onAdd: (task: Omit<Task, "id" | "createdAt">) => void;
    onCancel: () => void;
    defaultDate: string;
}

export default function TaskForm({ onAdd, onCancel, defaultDate }: TaskFormProps) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [date, setDate] = useState(defaultDate);
    const [time, setTime] = useState("");
    const [location, setLocation] = useState("");
    const [meetingLink, setMeetingLink] = useState("");

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!title.trim()) {
            alert("Task title is required");
            return;
        }

        onAdd({
            title: title.trim(),
            description: description.trim(),
            date,
            time: time || undefined,
            location: location.trim() || undefined,
            meetingLink: meetingLink.trim() || undefined,
            completed: false,
        });

        setTitle("");
        setDescription("");
        setDate(defaultDate);
        setTime("");
        setLocation("");
        setMeetingLink("");
    }

    return (
        <form className="task-form" onSubmit={handleSubmit}>
            <div className="form-group">
                <label>Task Title *</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What do you need to do?"
                    required
                />
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label>Date</label>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label>Time</label>
                    <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                    />
                </div>
            </div>

            <div className="form-group">
                <label>Description</label>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add details about this task..."
                    rows={3}
                />
            </div>

            <div className="form-group">
                <label>Location</label>
                <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Where? (e.g., Conference Room A)"
                />
            </div>

            <div className="form-group">
                <label>Meeting Link</label>
                <input
                    type="url"
                    value={meetingLink}
                    onChange={(e) => setMeetingLink(e.target.value)}
                    placeholder="https://zoom.us/... or https://meet.google.com/..."
                />
            </div>

            <div className="form-actions">
                <button type="submit" className="submit-btn">
                    Add Task
                </button>
                <button type="button" className="cancel-btn" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    );
}
