# Contributing to Kiln

Thanks for your interest in contributing. This guide will get you from zero to a running dev environment in under 5 minutes.

## Dev Environment Setup

### Prerequisites

1. **Rust** -- install via [rustup](https://rustup.rs/) (latest stable)
2. **Node.js** -- version 24 or later
3. **pnpm** -- version 10 or later (`npm install -g pnpm`)
4. **Tauri v2 dependencies** -- follow the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) for your platform (system libraries, build tools, etc.)

### First-Time Setup

```sh
git clone https://github.com/cristianllanos/kiln.git
cd kiln
pnpm install
```

### Running in Development

```sh
pnpm tauri dev
```

This starts the Vite dev server (with hot reload) and the Tauri/Rust backend together. Changes to frontend code reload instantly. Changes to Rust code trigger a recompile.

To run the frontend only (without the Rust backend):

```sh
pnpm dev
```

## Project Structure

```
kiln/
  src/              # Frontend (React + TypeScript)
  src-tauri/        # Backend (Rust, Tauri commands, PTY management)
  docs/             # Project documentation
    DECISIONS.md    # Architectural decision log
    ARCHITECTURE.md # Data flow and component responsibilities
    user/           # User-facing documentation
  ROADMAP.md        # Product spec and implementation phases
  CLAUDE.md         # Project context for AI-assisted development
```

**Frontend** (`src/`): React components, Zustand stores, Tailwind styles. This is where most UI work happens.

**Backend** (`src-tauri/`): Rust code for PTY management, stream parsing (OSC 133 markers, ANSI codes), and Tauri commands. Requires Rust knowledge.

## Code Conventions

- **TypeScript:** Strict mode enabled. No `any` types without justification.
- **Rust:** Run `cargo clippy` before submitting. Address all warnings.
- **Styling:** Tailwind CSS classes. No inline styles or CSS modules.
- **State management:** Zustand for global state. Local state with React hooks where appropriate.
- **Package manager:** Always use `pnpm`, not npm or yarn.

## Submitting Pull Requests

1. **Branch from `main`** -- use a descriptive branch name (e.g., `fix/block-scroll-behavior`, `feat/search-highlight`)
2. **Keep PRs focused** -- one feature or fix per PR
3. **Describe your changes** -- explain what changed and why. Link to a related issue if one exists.
4. **Test your changes** -- verify the app runs correctly with `pnpm tauri dev`
5. **Update docs if needed** -- if your change affects user-facing behavior, update the corresponding docs in `docs/user/`. See the documentation rules in [CLAUDE.md](CLAUDE.md).

## What to Work On

Check [ROADMAP.md](ROADMAP.md) for the current implementation plan and open tasks. Items are organized by phase with checkboxes indicating completion status.

For architectural context on why things are built the way they are, read [docs/DECISIONS.md](docs/DECISIONS.md) before proposing significant changes.

## Reporting Issues

Use the GitHub issue templates:
- **Bug report** -- include your OS, steps to reproduce, and expected vs. actual behavior
- **Feature request** -- describe the use case and any alternatives you considered
