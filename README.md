# Cadence

Real-time cross-device task management workspace paired with live CPU, memory, runtime, and security telemetry.

Cadence combines an owner-isolated Cloud Firestore task workspace with a Node.js + Express telemetry backend that streams host hardware metrics over Server-Sent Events (SSE) every second.

---

## Features

### Synchronized Task Workspace
- **Real-Time Multi-Device Sync**: Tasks created, updated, or archived on one device sync immediately across all signed-in sessions via Cloud Firestore (`onSnapshot`).
- **List & Board Views**: Switch between a dense sortable task list and a 3-column Kanban workflow (`To Do`, `In Progress`, `Done`).
- **Rich Task Controls**: Priorities (`low`, `medium`, `high`, `urgent`), custom lists/categories, due dates (`Today`, `Tomorrow`, or ISO date), notes, archiving, and undo support.
- **Smart Filtering & Shortcuts**: Search by title, notes, or list; filter by `Everything`, `Due Soon`, or `Urgent & High`; press `n` anywhere outside text inputs to open the task editor modal.
- **Draft Recovery & Hardware Tools**: Caches task drafts in `localStorage`, inspects browser storage quota, and provides one-click remediation task templates from the Hardware Tools panel.

### Live Dashboard & System Monitor
- **1-Second SSE Telemetry Stream**: Subscribes to `/api/system/stream` with a 300-sample (5-minute) rolling history window and automatic reconnection.
- **CPU & Runtime Metrics**: Overall and per-core CPU usage (`user` / `sys` / `idle`), 1m/5m/15m load averages, V8 heap statistics, Node.js event loop delay (`mean`, `p99`, `max`), and context switches.
- **Memory, Disk & Network**: Host RAM usage (including Linux `/proc/meminfo` and cgroup v2 limits when available), root filesystem capacity, and network interfaces.
- **Configurable Threshold Alerts**: Set custom CPU and memory warning percentages, inspect threshold breach events, or pause/resume live streaming.

### Cross-Device Session Management
- **Automatic Device Registration**: Tracks each signed-in browser/device with OS platform, browser engine, logical CPU cores (`navigator.hardwareConcurrency`), approximate RAM, and online heartbeat status.
- **Session Controls**: Rename devices and revoke stale or unrecognized sessions remotely.

### Security Posture & Host Audit
- **Combined Client + Host Audit**: Evaluates client session posture (Google email verification, transport security, stale devices, cached drafts, browser permissions via `navigator.permissions`) alongside host checks from `/api/system/security-scan` (OpenSSL version, process UID privilege, V8/RAM headroom, event loop latency, disk capacity, and `dist/.env` hygiene).
- **Immutable Audit History**: Persists security scan reports to Firestore (`securityScans`) with update rules disabled to preserve audit integrity.

### Localization & Appearance
- **Bilingual Interface**: Instant switching between **English** and **Myanmar (`မြန်မာ`)**, with bundled `Pyidaungsu-Regular` and `Pyidaungsu-Bold` WOFF2 fonts.
- **Light & Dark Themes**: Persisted theme toggle with accessible focus states and `prefers-reduced-motion` support.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide React, Motion
- **Backend**: Node.js, Express 4, `tsx` (serves `/api/*` and mounts Vite middleware in development)
- **Authentication & Database**: Firebase Authentication (Google Sign-In) & Cloud Firestore
- **Telemetry**: Node.js `os`, `v8`, `fs`, and `perf_hooks` (`monitorEventLoopDelay`) over Server-Sent Events (SSE)

---

## Project Structure

```text
├── server.ts                        # Express server, SSE telemetry sampler, and Vite dev middleware
├── firebase-blueprint.json          # Firestore schema blueprint (UserProfile, Task, DeviceSession, SecurityScan)
├── firestore.rules                  # Hardened owner-isolated Firestore security rules
├── firestore.rules.test.ts          # Firestore security rules test suite
├── firebase-applet-config.json      # Firebase project & database configuration
├── index.html                       # App entry point
├── public/fonts/                    # Pyidaungsu Regular & Bold WOFF2 fonts
└── src/
    ├── App.tsx                      # Main workspace shell, navigation, theme, and modal state
    ├── index.css                    # Tailwind CSS v4 theme, Pyidaungsu font-face, and motion utilities
    ├── types/app.ts                 # Shared TypeScript interfaces
    ├── hooks/
    │   ├── useRealtimeWorkspace.ts  # Firebase Auth + real-time Firestore subscriptions & mutations
    │   └── useSystemTelemetry.ts    # SSE client, history buffer, pause/resume, and threshold tracking
    ├── lib/
    │   ├── firebase.ts              # Firebase initialization and Firestore error reporting
    │   ├── i18n.tsx                 # English & Myanmar translation dictionaries and LanguageProvider
    │   ├── securityScan.ts          # Client-side & host security audit runner
    │   ├── device.ts                # Client device detection and session ID helpers
    │   ├── validation.ts            # Input limits and task validation
    │   └── formatters.ts            # Byte, uptime, and relative time formatters
    └── components/
        ├── TasksWorkspace.tsx       # Synchronized task list/board, filters, quick-add, and metrics bar
        ├── TaskEditorModal.tsx      # Create/edit task modal with draft persistence
        ├── TasksGuidePanel.tsx      # Built-in interactive user guide
        ├── HardwareToolsPanel.tsx   # Local storage inspector, hardware info, and diagnostic templates
        ├── LiveDashboardView.tsx    # Combined live telemetry, tasks, devices, and security overview
        ├── SystemTelemetryView.tsx  # Deep-dive CPU core breakdown, memory, runtime, and charts
        ├── LiveMetricChart.tsx      # Real-time SVG telemetry chart
        ├── CompactSystemWidget.tsx  # Sidebar live CPU & memory status widget
        ├── DevicesView.tsx          # Active & historical device session management
        ├── SecurityScanView.tsx     # Interactive security audit dashboard and scan history
        ├── ActivityView.tsx         # Synchronized task activity log
        └── ErrorBoundary.tsx        # Top-level React error boundary
```

---

## API Endpoints

All API routes are served by `server.ts`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check returning `{ ok: true, timestamp }`. |
| `GET` | `/api/system/stats` | Returns the latest `SystemSnapshot` and up to 300 historical points (5 minutes). |
| `GET` | `/api/system/stream` | Server-Sent Events (`text/event-stream`) pushing a `SystemSnapshot` every 1,000 ms. |
| `GET` | `/api/system/security-scan` | Runs live host security checks (OpenSSL, process UID, RAM/heap, event loop p99, disk, `.env` isolation, network interfaces). |

---

## Firestore Data Model & Security

All user data is strictly owner-isolated under `/users/{userId}` as defined in `firebase-blueprint.json` and enforced by `firestore.rules`:

- `/users/{userId}` — Private `UserProfile` document (owner-only read/write, collection `list` denied).
- `/users/{userId}/tasks/{taskId}` — Synchronized `Task` documents with field-level schema validation and action-scoped `update` rules.
- `/users/{userId}/devices/{deviceId}` — Registered `DeviceSession` heartbeats and hardware metadata.
- `/users/{userId}/securityScans/{scanId}` — Immutable `SecurityScan` audit records (`allow update: if false`).

All writes require a signed-in user with a verified email (`request.auth.token.email_verified == true`) and server-enforced timestamps (`request.time`).

---

## Getting Started

### Prerequisites

- **Node.js** 20+ (or **Bun**)
- A configured Firebase project with **Google Authentication** and **Cloud Firestore** enabled

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment & Firebase

Copy `.env.example` to `.env` if running with custom environment variables:

```bash
cp .env.example .env
```

Available variables in `.env.example`:
- `GEMINI_API_KEY` — Optional Gemini API key if extending server-side AI capabilities.
- `APP_URL` — Public URL where the app is hosted.
- `PORT` — Server port (defaults to `3000`).

Ensure `firebase-applet-config.json` contains your Firebase web app configuration and `firestoreDatabaseId`.

### 3. Run in Development

Starts Express with Vite HMR middleware on port `3000`:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### 4. Type Check & Build for Production

```bash
# TypeScript check
npm run lint

# Build frontend bundle into dist/
npm run build

# Start production server (serves dist/ + /api/*)
NODE_ENV=production npm start
```

---

## License

Apache-2.0
