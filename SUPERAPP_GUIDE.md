# SuperApp - Multi-App Productivity Suite

## Overview

SuperApp is a desktop application built with Tauri, React, and TypeScript that provides integrated productivity tools. It comprises two main sub-applications:

1. **Note Editor** - A markdown editor with live preview
2. **Task Manager** - A comprehensive task and productivity tracker

## Architecture

```
SuperApp (Main Router)
├── Home Dashboard
│   └── App Navigation Cards
│
├── Note Editor App
│   ├── Preview Mode (Read-only)
│   ├── Edit Mode (Live Editing)
│   └── File Save Handler
│
└── Task Manager App
    ├── Task Creation & Management
    ├── Daily Task Tracking
    ├── Progress Dashboard
    │   ├── Daily Progress Bar
    │   ├── Weekly Stats
    │   ├── Monthly Stats
    │   ├── All-Time Stats
    │   └── GitHub-style Heatmap
    └── Data Persistence
```

## Features

### 📝 Note Editor
- **Live Markdown Preview**: See your markdown formatted in real-time
- **Edit Mode**: Click "Edit" button to switch to editor mode
- **Auto-save**: Changes are persisted to local markdown files
- **Full Markdown Support**: Headers, lists, code blocks, tables, blockquotes, and more
- **Syntax Highlighting**: Clean, readable code blocks with syntax styling

### ✓ Task Manager
- **Task Creation**: Quick task entry with multiple fields
- **Task Details**:
  - Title and description
  - Due date and time
  - Location information
  - Meeting links (Zoom, Google Meet, etc.)
  - Completion status
  
- **Daily Tracking**:
  - Date picker for viewing tasks on specific days
  - Progress bar showing completion rate
  - Visual task list with metadata

- **Progress Analytics**:
  - Daily completion percentage
  - Weekly stats and trends
  - Monthly completion summary
  - All-time productivity metrics
  - GitHub-style activity heatmap showing weekly performance

- **Data Persistence**: All tasks and statistics are saved to local JSON files

## File Structure

```
src/
├── App.tsx                    # Main router between apps
├── NoteEditor.tsx             # Note editor component
├── TodoView.tsx               # Task manager component
├── types.ts                   # Type definitions
├── components/
│   ├── TaskForm.tsx           # Task creation form
│   ├── TaskList.tsx           # Task list display
│   └── ProgressTracker.tsx    # Progress visualization
├── utils/
│   ├── storage.ts             # File I/O operations
│   └── dateUtils.ts           # Date/time utilities
├── styles/
│   ├── App.css                # Home page styles
│   ├── NoteEditor.css         # Note editor styles
│   └── TodoView.css           # Task manager styles
└── main.tsx                   # React entry point

data/
├── note.md                    # Markdown notes storage
├── tasks.json                 # Tasks data
└── stats.json                 # Statistics data
```

## Data Models

### Task Interface
```typescript
interface Task {
  id: string;              // UUID
  title: string;           // Task name
  description: string;     // Detailed description
  date: string;            // YYYY-MM-DD format
  time?: string;           // HH:mm format (optional)
  location?: string;       // Location info (optional)
  meetingLink?: string;    // URL to meeting (optional)
  completed: boolean;      // Completion status
  createdAt: string;       // ISO timestamp
}
```

### Daily Stats Interface
```typescript
interface DailyStats {
  date: string;            // YYYY-MM-DD format
  total: number;           // Total tasks for the day
  completed: number;       // Completed tasks
}
```

## Technology Stack

### Frontend
- **React 19.2.0** - UI framework
- **TypeScript 5.9.3** - Type safety
- **Vite 7.2.4** - Build tool
- **React Markdown** - Markdown rendering
- **DayJS** - Date manipulation
- **UUID** - Unique ID generation

### Desktop
- **Tauri 2.9.5** - Desktop framework
- **Rust 2021 edition** - Backend runtime

### Development
- **ESLint** - Code linting
- **TypeScript ESLint** - TypeScript linting

## Getting Started

### Installation
```bash
# Install dependencies
npm install

# Install Tauri CLI (if not already installed)
npm install -g @tauri-apps/cli
```

### Development
```bash
# Start dev server
npm run dev

# Build and run with Tauri
cargo tauri dev
```

### Production Build
```bash
# Build web assets
npm run build

# Create production Tauri app
cargo tauri build
```

## Usage

### Opening the App
1. Launch SuperApp
2. See the home dashboard with two app cards
3. Click on either **Note Editor** or **Task Manager** to open

### Using Note Editor
1. Click "📝 Note Editor" from home
2. **View Mode**: See markdown rendered beautifully
3. Click "Edit" to switch to edit mode
4. Make changes in the textarea
5. Click "Save" to persist changes
6. Click "Cancel" to discard edits

### Using Task Manager
1. Click "✓ Task Manager" from home
2. Click "+ Add Task" to create a new task
3. Fill in task details:
   - **Task Title** (required)
   - **Date** (optional, defaults to today)
   - **Time** (optional)
   - **Location** (optional)
   - **Meeting Link** (optional - paste your Zoom/Meet link)
   - **Description** (optional)
4. Click "Add Task" to create
5. **Daily Tracking**: Use date picker to select different days
6. **Daily Progress**: See completion percentage and visual progress bar
7. **Progress Overview**: View stats for week, month, and all-time
8. **Activity Heatmap**: Green cells show days with completed tasks

## CSS Styling

The app uses a cohesive design system with CSS variables:
- **Color Scheme**: Blue primary, green accesses, professional grays
- **Responsive Design**: Mobile-friendly layouts
- **Smooth Interactions**: Transitions and hover effects
- **GitHub-style Heatmap**: Color intensity indicates completion percentage

## Future Enhancements

1. **Cloud Sync**: Integration with cloud storage (Google Drive, Dropbox)
2. **Recurring Tasks**: Set up recurring task patterns
3. **Task Categories/Tags**: Organize tasks by category
4. **Notifications**: Reminders for upcoming tasks
5. **Data Export**: Export tasks to CSV/PDF
6. **Dark Mode**: Theme switching
7. **Sidebar Navigation**: Quick access between apps
8. **Task Prioritization**: Set task priority levels
9. **Note Categories**: Organize notes by folders
10. **Collaboration**: Share notes and tasks with others

## Troubleshooting

### Missing Data Files
- The app automatically creates `data/note.md`, `data/tasks.json`, and `data/stats.json` if they don't exist
- Ensure the `data/` folder exists in the working directory

### Tasks Not Saving
- Check file permissions in the `data/` folder
- Ensure write access to the application directory
- Check browser console for error messages

### Build Issues
- Clear `node_modules/` and reinstall: `rm -rf node_modules && npm install`
- Clear TypeScript cache: `npm run build -- --reset`

## Development Tips

1. **Hot Reload**: Changes in React components hot-reload during `npm run dev`
2. **File I/O**: All file operations go through Rust backend via Tauri commands
3. **Date Handling**: Use `dateUtils.ts` functions for consistent date formatting
4. **Storage**: Use `storage.ts` functions for all file operations

## Contributing

1. Follow TypeScript and React best practices
2. Keep component logic separated from styling
3. Use meaningful commit messages
4. Test thoroughly before pushing changes
