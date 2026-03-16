<p align="center">
  <img src="resources/icon.png" alt="SparkFlow" width="80" />
</p>

<h1 align="center">SparkFlow</h1>

<p align="center">
  <strong>Turn your data into interactive apps — just describe what you need.</strong>
</p>

<p align="center">
  <a href="https://github.com/pontus-espe/sparkflow/actions/workflows/ci.yml"><img src="https://github.com/pontus-espe/sparkflow/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/pontus-espe/sparkflow/actions/workflows/release.yml"><img src="https://github.com/pontus-espe/sparkflow/actions/workflows/release.yml/badge.svg" alt="Build & Release" /></a>
  <a href="https://github.com/pontus-espe/sparkflow/releases/latest"><img src="https://img.shields.io/github/v/release/pontus-espe/sparkflow?label=latest" alt="Latest Release" /></a>
  <img src="https://img.shields.io/github/license/pontus-espe/sparkflow" alt="License" />
</p>

<p align="center">
  <img src="docs/screenshot.png" alt="SparkFlow Screenshot" width="900" />
</p>

## What is SparkFlow?

SparkFlow is a desktop app that lets you drop in your data — Excel spreadsheets, CSV files — and describe in plain language what you want to do with it. SparkFlow's AI then builds a fully interactive app right on an infinite canvas: dashboards, kanban boards, data tables, analytics tools, and more.

Think of it as a mix between **Miro** and **Notion**, where every card on the canvas is a live, working application tailored to your data.

### What you can do

- **Drop in data, get an app** — Import an Excel or CSV file, describe what you need ("make a bar chart of sales by region", "build a kanban board from this task list"), and get a working app in seconds.
- **Arrange everything on a canvas** — Lay out multiple apps side by side, resize them, and organize your workspace freely on an infinite canvas.
- **Apps that update with your data** — SparkFlow watches your files for changes and apps update automatically. Apps can also write data back.
- **Charts, tables, and more** — Built-in bar, line, area, and pie charts that adapt to your data automatically.
- **Works across boards** — Create separate boards for different projects using the tabbed interface.
- **Runs locally and privately** — AI runs on your machine via Ollama. No data leaves your computer. Optionally connect Anthropic's API for more powerful models.
- **Light and dark mode** — Follows your system theme or toggle manually.

## Download

Head to the [**Releases page**](https://github.com/pontus-espe/sparkflow/releases/latest) and download the installer for your platform:

| Platform | File |
|----------|------|
| **Windows** | `SparkFlow-Setup-x.x.x.exe` (installer) or `SparkFlow-x.x.x.exe` (portable) |
| **macOS** | `SparkFlow-x.x.x.dmg` |
| **Linux** | `SparkFlow-x.x.x.AppImage` or `.deb` |

## Building from Source

If you'd like to run SparkFlow from source or contribute:

```bash
git clone https://github.com/pontus-espe/sparkflow.git
cd sparkflow
npm install
npm run dev
```

To package a distributable:

```bash
npm run dist
```

## Architecture

| Layer | Tech |
|-------|------|
| Framework | Electron + React 19 + TypeScript |
| Build | electron-vite 5.0 + Sucrase |
| Canvas | @xyflow/react |
| Styling | Tailwind CSS 4 |
| State | Zustand (4 stores: board, microapp, data, AI) |
| Database | sql.js (WASM SQLite) |
| AI Runtime | electron-ollama (bundled) or Anthropic API |

### Microapp SDK

AI-generated microapps run in a sandboxed `new Function()` environment with a controlled standard library:

| Category | APIs |
|----------|------|
| React | `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef` |
| Persistence | `useAppState(key, default)`, `useTable(name)`, `useData(sourceId?)` |
| Charts | `UI.BarChart`, `UI.LineChart`, `UI.AreaChart`, `UI.PieChart` |
| UI Components | `UI.Button`, `UI.Input`, `UI.Card`, `UI.Badge`, `UI.Checkbox`, `UI.Tabs` |
| File I/O | `file.readText()`, `file.writeJSON()`, `file.writeCSV()`, etc. |
| Notifications | `notify(message, type?)` |
| Utilities | `utils.formatDate()`, `utils.formatNumber()`, `utils.groupBy()`, `utils.sortBy()`, `utils.sum()` |

### Project Structure

```
electron/           # Main process
  main.ts           # Window creation, IPC setup
  preload.ts        # Context bridge
  data/             # Database, file parsing, file watching
  ipc/              # IPC handlers (data, board, ollama, files)
  ollama/           # Bundled Ollama runtime
src/                # Renderer process
  components/
    canvas/         # React Flow canvas + node types
    microapp/       # Microapp renderer, runtime/stdlib
    ui/             # Shadcn UI components + charts
    ai/             # Command palette, model settings
  stores/           # Zustand stores
  services/         # IPC client, compiler, generation
  lib/              # Utilities, AI prompt templates
  types/            # TypeScript type definitions
shared/             # IPC channel constants
```

## CI & Security

Every push and pull request runs the following checks via GitHub Actions:

| Check | What it does |
|-------|-------------|
| **TypeScript** | `tsc --noEmit` — catches type errors across the entire codebase |
| **Build** | Full `electron-vite build` — ensures renderer + main process compile |
| **Dependency Audit** | `npm audit` — flags known vulnerabilities in production dependencies |
| **CodeQL** | GitHub's semantic code analysis — detects security vulnerabilities, bugs, and anti-patterns in JS/TS |
| **Electron Security** | Custom check verifying `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and absence of dangerous patterns like `webSecurity: false` |

### Electron Security Model

SparkFlow follows Electron security best practices:

- **Context Isolation** — Renderer and main process are fully isolated via `contextBridge`
- **Sandbox enabled** — Renderer runs in a Chromium sandbox
- **No Node Integration** — Renderer cannot access Node.js APIs directly
- **Preload bridge** — All IPC goes through a typed preload script with explicit channel allowlisting
- **Microapp sandbox** — AI-generated code runs in `new Function()` with a controlled stdlib — no access to `window`, `document`, `fetch`, or `require`

## License

[MIT](LICENSE)
