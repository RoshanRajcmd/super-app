export interface Task {
    id: string;
    title: string;
    description: string;
    date: string; // YYYY-MM-DD
    time?: string; // HH:mm
    location?: string;
    meetingLink?: string;
    completed: boolean;
    createdAt: string;
}

export interface DailyStats {
    date: string; // YYYY-MM-DD
    total: number;
    completed: number;
}

export interface AppState {
    currentApp: 'notes' | 'todos';
}
