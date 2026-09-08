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

## Getting Started

This is the whole path from a fresh clone to an installable APK, in order:

| Stage | Steps | What you need installed |
| --- | --- | --- |
| Run in a browser | 1–3 | Node, npm |
| Run as a desktop app (optional) | 4 | + Rust, Xcode Command Line Tools |
| Run on an Android emulator | 5–8 | + JDK 21, Android SDK, NDK, Rust Android targets |
| Build a release APK | 9–10 | same as above |

Nothing Android-related is needed for steps 1–4, so it is worth getting the app
up in a browser first and only then paying the toolchain cost.

macOS is assumed throughout (shell snippets are zsh, and paths such as
`~/Library/Android/sdk` are macOS locations).

### Step 1 — Install prerequisites

| Tool | Version this was last built with | How to get it |
| --- | --- | --- |
| Node + npm | Node 25.2, npm 11.6 (Vite 7 needs Node 20.19+ or 22.12+) | [nodejs.org](https://nodejs.org) or `brew install node` |
| Rust (stable, via rustup) | 1.90 | [rustup.rs](https://rustup.rs) — needed from step 4 on |
| Xcode Command Line Tools | — | `xcode-select --install` — provides the linker Rust needs |

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Run in the browser

```bash
npm run dev
```

The dev server listens on <http://localhost:3000>. The port is fixed —
[vite.config.ts](vite.config.ts) sets `strictPort`, so the server fails rather
than sliding to 3001 if something else holds the port.

To reach it from another device on the network:

```bash
npm run dev -- --host 0.0.0.0
```

A browser tab stores its data in `localStorage`, while every Tauri shell uses
the store plugin ([src/utils/platform.ts](src/utils/platform.ts) picks between
them). So the browser and the packaged app never share content — see
[Why the APK is not a pixel-for-pixel copy of `npm run dev`](#why-the-apk-is-not-a-pixel-for-pixel-copy-of-npm-run-dev).

### Step 4 — Run as a desktop app (optional)

```bash
npm run desktop:dev     # dev build, loads from the vite dev server
npm run desktop:build   # production bundle
```

This is not a prerequisite for the Android steps; it is the fastest way to
exercise the native file access that a browser tab cannot reach.

### Step 5 — Set up the Android toolchain (one time)

Four things are needed: **JDK 21**, the **Android SDK** (platform + build tools
+ emulator), the **NDK**, and the four **Rust Android targets** Tauri
cross-compiles to.

#### 5a. JDK 21

Not the JDK bundled with Android Studio — see
[Gradle fails on `':buildSrc'`](#troubleshooting-the-toolchain) for what goes
wrong. Install any JDK 21 (`brew install --cask corretto@21`, or Temurin 21) and
confirm it is discoverable:

```bash
/usr/libexec/java_home -v 21
```

#### 5b. Android SDK, build tools, NDK, emulator

The simplest source is Android Studio's SDK Manager, which installs into
`~/Library/Android/sdk`. Android Studio is then not needed for anything else —
every command below runs in a terminal, and building *inside* Android Studio has
its own failure mode
([`Cannot run program "npm"`](#troubleshooting-the-toolchain)).

Without Android Studio, download the
[command line tools](https://developer.android.com/studio#command-line-tools-only)
into `~/Library/Android/sdk/cmdline-tools`, then install the packages:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
SDKMANAGER="$ANDROID_HOME/cmdline-tools/bin/sdkmanager"   # Android Studio installs put this at cmdline-tools/latest/bin/sdkmanager

"$SDKMANAGER" --sdk_root="$ANDROID_HOME" \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0" \
  "ndk;30.0.16138531" \
  "emulator" \
  "system-images;android-36;google_apis_playstore;arm64-v8a"
```

Notes on those versions:

- `platforms;android-36` and `build-tools;36.0.0` match `compileSdk = 36` /
  `targetSdk = 36` in
  [src-tauri/gen/android/app/build.gradle.kts](src-tauri/gen/android/app/build.gradle.kts).
  `minSdk` is 24.
- The NDK version is whatever you install — it only has to match `NDK_HOME`
  below. `30.0.16138531` is what this was last built with.
- The system image is for the emulator in step 6. Use `arm64-v8a` on Apple
  silicon and `x86_64` on Intel. `"$SDKMANAGER" --list | grep system-images`
  shows the images actually available to you.
- `build-tools` also provides `zipalign` and `apksigner`, used for signing in
  step 10.

#### 5c. Environment variables

`JAVA_HOME` is the one that bites. Leave it unset and the Tauri CLI silently
falls back to Android Studio's bundled JDK, which Gradle cannot configure, so
every Android command has to run in a shell that has it set. Put all four in
`~/.zshrc` rather than retyping them per terminal:

```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/30.0.16138531"   # match the version you installed
export PATH="$ANDROID_HOME/platform-tools:$PATH"    # puts adb on the path
```

Open a new shell afterwards, or `source ~/.zshrc`.

`ANDROID_HOME` is also how Gradle finds the SDK: `local.properties` inside the
generated Android project is gitignored, so a fresh clone does not have one and
the environment variable is what stands in for it.

#### 5d. Rust Android targets

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

#### 5e. Verify before going further

```bash
java -version                       # must report 21
adb version
ls "$NDK_HOME"                      # must exist
rustup target list --installed | grep android   # expect the four above
```

#### 5f. Do not run `android:init` on a clone

`src-tauri/gen/android` is **tracked in git, not generated on demand**, because
its manifest is edited by hand (see
[File access on Android](#file-access-on-android)) and `android:init` would throw
those edits away. On a fresh clone the directory is already there and
`npm run android:init` is not part of setup.

Only run it if the directory is genuinely missing, and re-apply the manifest
edits afterwards.

### Step 6 — Create and start an emulator

Create an AVD from the system image installed in step 5b (once), then boot it:

```bash
"$ANDROID_HOME/cmdline-tools/bin/avdmanager" create avd \
  --name Medium_Phone \
  --package "system-images;android-36;google_apis_playstore;arm64-v8a" \
  --device pixel_6

"$ANDROID_HOME/emulator/emulator" -avd Medium_Phone &
```

Skip creation if you already made a device in Android Studio's Device Manager —
`"$ANDROID_HOME/emulator/emulator" -list-avds` shows what exists. A physical
phone works anywhere an emulator does; enable USB debugging and plug it in.

Either way, confirm the target is visible before building:

```bash
adb devices     # the emulator or phone must be listed as "device"
```

### Step 7 — Run the app on the emulator

```bash
npm run android:dev
```

This builds the Rust library, installs a debug build, and serves the UI from the
vite dev server over the LAN address Tauri passes in as `TAURI_DEV_HOST`, so
edits hot-reload on the device. It is the fastest Android loop, but note what it
does *not* test: the assets embedded in the binary. For that, step 8.

### Step 8 — Run the packaged UI (debug APK)

A **debug APK** carries the same embedded `build/` output as a release APK but is
debuggable and installable without signing, which makes it the right way to look
at the packaged frontend:

```bash
npm run tauri -- android build --debug --apk true --target aarch64
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
adb shell am start -n com.superapp.productivity/.MainActivity
```

`--target` must match the device ABI, which `adb shell getprop ro.product.cpu.abi`
reports; drop the flag to build all four:

| Device ABI | `--target` value |
| --- | --- |
| `arm64-v8a` | `aarch64` |
| `armeabi-v7a` | `armv7` |
| `x86_64` | `x86_64` |
| `x86` | `i686` |

Debug builds keep WebView debugging on, so `chrome://inspect` in desktop Chrome
attaches devtools to the running app, and
`adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png` grabs a
screenshot.

### Step 9 — Build the release APK and AAB

```bash
npm run android:build
```

Expect a few minutes: it type-checks and bundles the frontend, compiles the Rust
library for all four ABIs, then runs Gradle. Two artifacts land under
`src-tauri/gen/android/app/build/outputs/`:

| Artifact | Path |
| --- | --- |
| APK (universal, **unsigned**) | `apk/universal/release/app-universal-release-unsigned.apk` |
| AAB (for Play Store upload) | `bundle/universalRelease/app-universal-release.aab` |

Variations:

```bash
npm run tauri -- android build --apk true --split-per-abi   # per-architecture APKs instead of one universal
npm run tauri -- android build --aab false --apk true       # APK only; --apk/--aab take an explicit value
```

The release APK is unsigned, and `adb install` rejects it
(`INSTALL_PARSE_FAILED_NO_CERTIFICATES`). Either use the debug APK from step 8,
or sign it as below.

### Step 10 — Sign the release APK

A one-off self-signed key is enough for installing on your own devices. Play
Store distribution has its own signing requirements beyond this.

Create a keystore once:

```bash
keytool -genkeypair -v \
  -keystore ~/.android/superapp-release.jks \
  -alias superapp -keyalg RSA -keysize 2048 -validity 10000
```

Keep the keystore and its password outside the repository — anything committed to
git is effectively permanent, and a leaked signing key lets someone else publish
updates that Android will accept as yours. `~/.android/` above is outside the
project on purpose. Losing the key means future builds can no longer update an
installed app, so back it up somewhere durable.

Then align and sign each build:

```bash
BT="$ANDROID_HOME/build-tools/36.0.0"
OUT=src-tauri/gen/android/app/build/outputs/apk/universal/release

"$BT/zipalign" -p -f 4 "$OUT/app-universal-release-unsigned.apk" "$OUT/app-universal-release.apk"
"$BT/apksigner" sign --ks ~/.android/superapp-release.jks --ks-key-alias superapp "$OUT/app-universal-release.apk"
"$BT/apksigner" verify --print-certs "$OUT/app-universal-release.apk"

adb install -r "$OUT/app-universal-release.apk"
```

## Clean Build Artifacts

To remove generated build artifacts and free up disk space:

```bash
npm run clean
```

This removes the Vite `dist/`, Tauri/Rust `target/`, and Android `app/build/` directories. Source files and the tracked Android project remain untouched.

>DO NOT DELETE ./src-tauri/gen/android/ and it content except `build`


## Android Reference

Background that the step-by-step path above links to.

### Troubleshooting the toolchain

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

Setting `JAVA_HOME` to JDK 21 as in step 5c fixes it. If the error survives that,
a daemon is still alive on the wrong JVM — `src-tauri/gen/android/gradlew --stop`
clears it.

**`SDK location not found`.** Gradle reads the SDK path from
`ANDROID_HOME`/`ANDROID_SDK_ROOT` or from `src-tauri/gen/android/local.properties`,
and that file is gitignored, so a fresh clone has neither until step 5c is done.
Export `ANDROID_HOME` in the shell you build from, or write
`sdk.dir=/Users/<you>/Library/Android/sdk` into `local.properties`.

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

**A blank screen in the APK.** The on-screen crash overlay
([src/utils/crashOverlay.ts](src/utils/crashOverlay.ts)) prints the error into the
page, since a packaged app has no console.
`adb logcat | grep -iE "chromium|console|tauri"` gives the same information over a
cable.

### Why the APK is not a pixel-for-pixel copy of `npm run dev`

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
  regardless. So [src/utils/shell.ts](src/utils/shell.ts) tags `<html>` with
  `data-shell="android"` and `App.css` applies a floor to `--inset-top` /
  `--inset-bottom` for that shell. Without it, the header sits under the status bar
  and the footer under the navigation bar — which is most of what "the APK looks
  completely different" means.
- **Fonts.** The body font stack resolves to the system UI font, which is SF Pro on
  macOS and Roboto on Android. Text metrics differ slightly as a result.

### File access on Android

Android's file and folder pickers return `content://` URIs, which have no
filesystem path behind them: they cannot be re-opened later, written back to in
place, or looked beside for a note's images. This app is built around real paths in
a Drive-synced folder, so on Android the notes home offers **Open by path** and a
typed folder for new notes instead of the picker.

Reading arbitrary folders that way needs all-files access, which is a two-part
grant:

1. Add the permission to
   [src-tauri/gen/android/app/src/main/AndroidManifest.xml](src-tauri/gen/android/app/src/main/AndroidManifest.xml),
   inside `<manifest>` and beside the existing `<uses-permission>` entries:

   ```xml
   <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
   ```

2. On the device, grant it once: Settings → Apps → SuperApp → Permissions →
   All files access.

This is the hand edit that makes `src-tauri/gen/android` a tracked directory
rather than a generated one, so re-running `android:init` reverts it.

The habit tracker goes the other way, because a single file needs no folder
tree: it opens the system document browser (a small in-app Kotlin plugin,
`src-tauri/gen/android/.../SafPlugin.kt`, plus `android_saf.rs`), takes a
persistable read-write grant on the document, and reads and writes it through
`tauri-plugin-fs`. That survives restarts and needs no storage permission, so
there is no typed path anywhere in the habit UI. The one catch is below: a program
that replaces the file rather than rewriting it invalidates the grant.

The alternative design for notes — Storage Access Framework tree URIs, as
[SimpleMarkdown](https://codeberg.org/wbrawner/SimpleMarkdown) uses, which needs no
storage permission at all — would mean giving up direct paths, and with them
in-place saving to a synced folder and sibling-image lookup.

### Moving files onto an emulator or device

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
  "tauri": "tauri",
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
