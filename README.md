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
- A `DayType` column per habit — `weekend`, `weekday` or `both` (blank counts as
  `both`) — so a weekend chore is locked and ignored by the score on a Tuesday
  instead of reading as a miss
- The sheet is re-read every 30 seconds and whenever the app returns to the
  foreground, so an edit synced in from another machine shows up on its own

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

### Android

#### Toolchain

Building for Android needs the Android SDK and NDK, the four Rust targets Tauri
cross-compiles to, and **JDK 21** — not the JDK bundled with Android Studio.

`JAVA_HOME` is the one that bites. Leave it unset and the Tauri CLI silently falls
back to Android Studio's bundled JDK, which Gradle cannot configure, so every
Android command has to run in a shell that has it set:

```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
npm run android:dev
```

Put all four in `~/.zshrc` rather than retyping them per terminal:

```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"     # see "Gradle fails on ':buildSrc'" below
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/<version>"          # e.g. 30.0.16138531
export PATH="$ANDROID_HOME/platform-tools:$PATH"       # puts adb on the path
```

`java -version` should report 21 afterwards. Then:

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
npm run android:init      # once, generates src-tauri/gen/android
npm run android:dev       # on a connected device or emulator, served by the vite dev server
npm run android:build     # release APK / AAB
```

Release artifacts land under
`src-tauri/gen/android/app/build/outputs/apk/universal/release/`. A release APK is
unsigned by default. `--split-per-abi` produces per-architecture APKs instead of the
universal one, and `--apk` / `--aab` take an explicit value:

```bash
npm run tauri -- android build --apk true --split-per-abi
```

`src-tauri/gen/android` is tracked, not ignored, because the manifest is edited by
hand (see below) and `android:init` would otherwise throw those edits away.

#### Running the packaged UI on an emulator or phone

`npm run android:dev` loads the UI from the vite dev server, so it does not exercise
the assets that are actually embedded in the binary. To look at the packaged build,
build a **debug APK** — same embedded `build/` output as release, but debuggable and
installable without signing — and push it over adb:

```bash
npm run tauri -- android build --debug --apk true --target aarch64   # match the device ABI
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
adb shell am start -n com.superapp.productivity/.MainActivity
```

`adb shell getprop ro.product.cpu.abi` reports the ABI to pass to `--target`
(`arm64-v8a` → `aarch64`); drop `--target` to build all four. Debug builds keep
WebView debugging on, so `chrome://inspect` in desktop Chrome attaches devtools to
the running app, and `adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png`
grabs a screenshot.

Android Studio is not needed for any of this, and opening `src-tauri/gen/android`
there is the slower path — see the two failure modes below.

#### Troubleshooting the toolchain

**Gradle fails on `':buildSrc'`.** The Tauri CLI points `JAVA_HOME` at the JDK
bundled with Android Studio when the variable is unset. Recent Android Studio ships
JDK 25, which the `kotlin-dsl` plugin under Gradle 8.14 cannot configure, and the
error is just the version number with no context:

```
A problem occurred configuring project ':buildSrc'.
> 25.0.2
```

The patch number tracks whatever Android Studio currently bundles, so it also shows
up as `> 25.0.3` and so on. The giveaway is a line earlier in the same output:

```
Info Using Android Studio's default Java installation: /Applications/Android Studio.app/Contents/jbr/Contents/Home
```

Setting `JAVA_HOME` to JDK 21 as shown above fixes it. If the error survives that,
a daemon is still alive on the wrong JVM — `src-tauri/gen/android/gradlew --stop`
clears it.

**`Cannot run program "npm"` during `:app:rustBuildArmDebug`.** The generated Gradle
project shells out to `npm` to build the Rust library. macOS apps launched from the
Dock or Finder inherit only the bare system `PATH`, so a Homebrew or nvm-managed npm
is invisible to Android Studio:

```
Caused by: java.io.IOException: Cannot run program "npm" (in directory ".../src-tauri"): error=2
```

Build from the terminal instead. If you do want Android Studio, launch it from a
shell so it inherits your `PATH`
(`/Applications/Android\ Studio.app/Contents/MacOS/studio &` — `open -a` does not
work, launchd strips the environment), or symlink node and npm into `/usr/local/bin`.

#### Why the APK is not a pixel-for-pixel copy of `npm run dev`

Three differences are expected rather than being bugs to chase:

- **Stored content.** [src/utils/platform.ts](src/utils/platform.ts) picks the
  storage backend from whether `__TAURI_INTERNALS__` is present: `localStorage` in a
  plain browser tab, the Tauri store plugin everywhere else. A browser tab and a
  fresh Android install therefore start from different data, so the APK opens on
  empty states — no recent notes, no tasks, no habit sheet — where `npm run dev`
  shows whatever you accumulated. Same components, different content.
- **Safe-area insets.** Android's WebView only began forwarding the status and
  navigation bar insets to `env(safe-area-inset-*)` in Chrome 136, and then only
  for fullscreen WebViews, with the rest landing in 144; several versions in
  between report a flat `0px`. Android 15 lays every app out edge-to-edge
  regardless. So `src/utils/shell.ts` tags `<html>` with `data-shell="android"`
  and `App.css` applies a floor to `--inset-top` / `--inset-bottom` for that shell.
  Without it, the header sits under the status bar and the footer under the
  navigation bar — which is most of what "the APK looks completely different"
  means.
- **Fonts.** The body font stack resolves to the system UI font, which is SF Pro on
  macOS and Roboto on Android. Text metrics differ slightly as a result.

If the APK shows a blank screen instead, the on-screen crash overlay
(`src/utils/crashOverlay.ts`) prints the error into the page, since a packaged app
has no console. `adb logcat | grep -iE "chromium|console|tauri"` gives the same
information over a cable.

#### File access on Android

Android's file and folder pickers return `content://` URIs, which have no
filesystem path behind them: they cannot be re-opened later, written back to in
place, or looked beside for a note's images. This app is built around real paths in
a Drive-synced folder, so on Android the notes home offers **Open by path** and a
typed folder for new notes instead of the picker.

Reading arbitrary folders that way needs all-files access, which is a two-part
grant:

1. Add the permission to `src-tauri/gen/android/app/src/main/AndroidManifest.xml`,
   inside `<manifest>` and beside the existing `<uses-permission>` entries:

   ```xml
   <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
   ```

2. On the device, grant it once: Settings → Apps → SuperApp → Permissions →
   All files access.

The habit tracker goes the other way, because a single file needs no folder
tree: it opens the system document browser (a small in-app Kotlin plugin,
`src-tauri/gen/android/.../SafPlugin.kt`, plus `android_saf.rs`), takes a
persistable read-write grant on the document, and reads and writes it through
`tauri-plugin-fs`. That survives restarts and needs no storage permission, so
there is no typed path anywhere in the habit UI. The one catch is above: a program
that replaces the file rather than rewriting it invalidates the grant.

The alternative design for notes — Storage Access Framework tree URIs, as
[SimpleMarkdown](https://codeberg.org/wbrawner/SimpleMarkdown) uses, which needs no
storage permission at all — would mean giving up direct paths, and with them
in-place saving to a synced folder and sibling-image lookup.

### To move files into android studio emulator

```bash
export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
adb push /Users/roshnrj/Documents/MyDocs/HabitTracker2026.csv /sdcard/Documents/HabitTracker2026.csv
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Documents/HabitTracker2026.csv
```

`adb push` deletes and recreates the file, which gives it a new document identity
and revokes the picker permission the habit tracker holds — the app then says
access was withdrawn and asks you to Import the file again. To replace the contents
of a sheet the app is already tracking, overwrite it in place instead, which keeps
the grant and is picked up by the next refresh:

```bash
adb push HabitTracker2026.csv /sdcard/Documents/.staged.csv
adb shell "cp /sdcard/Documents/.staged.csv /sdcard/Documents/HabitTracker2026.csv && rm /sdcard/Documents/.staged.csv"
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
  "desktop:build": "tauri build",
  "android:init": "tauri android init",
  "android:dev": "tauri android dev",
  "android:build": "tauri android build",
  "ios:init": "tauri ios init",
  "ios:dev": "tauri ios dev",
  "ios:build": "tauri ios build"
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
