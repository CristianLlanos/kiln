# Kiln

A modern command runner for developers who live in the terminal every day. Kiln is not a terminal emulator -- it's a beautiful UI for running commands and reading their output.

<!-- TODO: Add screenshot -->

## What is Kiln?

Kiln renders command output as styled, readable blocks instead of a character grid. Each command and its output is a distinct visual unit with proper typography, easy copying, and search.

When you need a full terminal (vim, htop, ssh), Kiln detects it automatically and switches to an embedded terminal. When you exit, it returns to the block-based view.

### Key Features

- **Block-based output** -- each command+output is a visual card with status, duration, and exit code
- **Styled ANSI rendering** -- colors and formatting rendered as native DOM text, not a terminal grid
- **Rich previews** -- JSON (collapsible tree), diff, CSV/TSV (table), Markdown (with syntax-highlighted code blocks), column-aligned tables
- **Interactive mode** -- seamless switch to embedded xterm.js for TUI programs (vim, htop, ssh)
- **Session management** -- multiple sessions per window, switch with `Cmd+E` fuzzy finder
- **Session persistence** -- windows, sessions, and command history restored on launch
- **Theming** -- dark and light built-in themes, custom `.toml` theme files
- **Autocomplete** -- filesystem paths + shell history, keyboard-navigable dropdown
- **Notifications** -- OS notifications when long-running commands finish in the background
- **Auto-updater** -- checks GitHub Releases, subtle header badge when updates are available
- **Keyboard-first** -- command palette (`Cmd+P`), session switcher (`Cmd+E`), search (`Cmd+F`)
- **Privacy-first** -- no accounts, no telemetry, no cloud

### Platform Support

- macOS (Apple Silicon)
- Windows 11+
- Linux (Wayland)

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) 24+
- [pnpm](https://pnpm.io/) 10+
- Platform dependencies for [Tauri v2](https://v2.tauri.app/start/prerequisites/)

### Clone and Run

```sh
git clone https://github.com/cristianllanos/kiln.git
cd kiln
pnpm install
pnpm tauri dev
```

### Build Commands

| Command | Description |
|---|---|
| `pnpm tauri dev` | Run in development mode with hot reload |
| `pnpm tauri build` | Build release binaries for your platform |
| `pnpm dev` | Run frontend only (no Tauri/Rust backend) |
| `pnpm build` | Build frontend only |

## Architecture

Kiln uses a dual-mode architecture built on Tauri v2:

- **Normal mode (95% of usage):** Commands run through a persistent PTY shell. Rust parses the output stream (OSC 133 markers for block boundaries, ANSI codes for styling) and sends structured data to React. Output renders as styled DOM elements.

- **Interactive mode:** When a program activates alt screen (vim, htop, etc.), the UI switches to fullscreen xterm.js with raw PTY passthrough. Returns to normal mode when the program exits.

### Tech Stack

- **Backend:** Tauri v2 (Rust)
- **Frontend:** Vite + React + TypeScript
- **Styling:** Tailwind CSS
- **State:** Zustand
- **Terminal fallback:** xterm.js
- **Markdown:** markdown-it + highlight.js
- **Persistence:** MessagePack
- **Package manager:** pnpm

## Documentation

- [ROADMAP.md](ROADMAP.md) -- product spec, architecture, phases
- [docs/DECISIONS.md](docs/DECISIONS.md) -- architectural decision log
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) -- data flow and component responsibilities
- [docs/user/](docs/user/) -- user-facing documentation

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and how to submit PRs.

## License

[MIT](LICENSE)
