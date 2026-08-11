# SuperApp

SuperApp is a personal productivity suite that brings together the apps I use every day for planning, writing, reflecting, and habit tracking. It is designed as a lightweight replacement for depending on a growing number of third-party productivity platforms that charge for features, keep data closed behind proprietary systems, and make it difficult to preserve a consistent workflow.

The product goal is simple: keep my own tools, my own data, and my own workflows. I want a daily dashboard that supports the things I actually use on mobile and laptop without handing ownership of my content to another company or being forced into a platform-specific ecosystem.

## Product Vision

SuperApp is not a SaaS product, a sync platform, or a marketplace product. It is a local-first personal management system for private, cross-device knowledge work.

The guiding principles are:

- Privacy-first productivity: content is treated as personal data and should not be locked behind vendor-controlled data models.
- File ownership: important content should live in open, portable formats such as Markdown and CSV/structured data files.
- Minimal third-party dependency: the app should reduce reliance on subscription tools and feature-gated ecosystems.
- Personal portability: exported or imported data should remain human-readable and easy to recover, inspect, and move.
- Local-first editing: files in cloud storage such as Google Drive can be opened and edited through the app without introducing unnecessary sync-management complexity.

## What SuperApp Includes

The current application surface is a set of productivity modules:

- A note editor for writing and reviewing Markdown notes
- A task manager for daily planning, scheduling, tracking, and status updates
- A habit tracker for routine monitoring, progress, heatmaps, and consistency views
- A home dashboard that routes between these modules

The interface is built with React, TypeScript, and Vite, with a Tauri shell enabling desktop-oriented execution and native file integration.

## Architecture

The app is organized as a frontend application with a web-first React experience and a desktop wrapper.

### Main Application Shell

- [src/App.tsx](src/App.tsx) contains the navigation layer and switches between the dashboard, notes, tasks, and habits views.
- [src/NoteEditor.tsx](src/NoteEditor.tsx) implements markdown editing and note rendering.
- [src/TodoView.tsx](src/TodoView.tsx) implements the task-management workflow.
- [src/HabitTracker.tsx](src/HabitTracker.tsx) implements the habit sheet and progress views.

### Supporting Code

The repository contains reusable UI, data, and file-handling layers:

- [src/components](src/components) contains reusable product modules such as task forms, trackers, setup screens, and dashboard sections.
- [src/utils](src/utils) contains helpers for dates, file access, platform detection, storage, and habit data processing.
- [src/types.ts](src/types.ts) defines shared project data contracts.

## Data Strategy

SuperApp is intentionally designed around ordinary, durable file formats instead of proprietary data objects.

The long-term direction is:

- Notes stored in Markdown (`.md`)
- Task or activity tracking data stored in common structured formats such as JSON and CSV-style exports
- Habit and routine data maintained in a plain UTF-8 CSV file that can be opened and inspected outside the application
- Cloud storage such as Google Drive used as a file location rather than as a managed sync layer

This means the app should read and write files that can be moved between environments and tools without losing their core meaning.

## Tech Stack

### Frontend

- React 19
- TypeScript
- Vite
- React Markdown
- DayJS
- UUID

### Desktop Runtime

- Tauri 2
- Rust backend integration for native desktop/runtime access

### Tooling

- ESLint
- TypeScript ESLint
- Vite React plugin

## Features

### Notes

- Markdown authoring and preview experience
- Local file-backed note storage
- Simple flow for editing, saving, and reviewing note content

### Tasks

- Task creation and lifecycle management
- Dates, times, links, descriptions, and location metadata
- Daily, weekly, monthly, and all-time progress indicators

### Habits

- Spreadsheet and tracker-oriented habit view
- Heatmap-style activity visualization
- Completion and consistency reporting for patterns over time

## Developer Setup

### Installing Dependencies

```bash
npm install
```

### Running the Web Interface

```bash
npm run dev
```

For external network access during development:

```bash
npm run dev -- --host 0.0.0.0
```

### Running the Desktop App

```bash
npm run desktop:dev
```

### Production Desktop Build

```bash
npm run desktop:build
```

## Build and Quality Checks

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## Project Scripts

The main scripts exposed in [package.json](package.json) are:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "desktop:dev": "tauri dev",
  "desktop:build": "tauri build"
}
```

## Data and Storage Philosophy

This repository is shaped around a file-first philosophy. The app is intended to open files from personal storage locations and work with them directly instead of creating a proprietary sync layer.

That design supports the following lifecycle:

1. Move files into Google Drive or another personal cloud folder.
2. Open the file from the app environment.
3. Edit and persist the content through the application.
4. Keep the content in a portable format that can be reused outside the app.

The goal is not to force a cloud account, a subscription, or a vendor-specific content format. The goal is a durable personal operating layer for daily productivity workflows.
