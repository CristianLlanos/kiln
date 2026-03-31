# Kiln - Command Runner

## What is this?

Kiln is a modern command runner — not a terminal emulator. It provides a beautiful, chat-style UI for running shell commands and reading their output. When you need a full terminal (vim, htop, ssh), it seamlessly switches to an embedded terminal and back.

Target audience: developers who use terminals on consumer computers every day.

## Key Documents

- **ROADMAP.md** — full product spec: architecture, UX behaviors, block data model, phases, config schema
- **docs/DECISIONS.md** — why we made each architectural/design choice
- **docs/ARCHITECTURE.md** — data flow, component responsibilities, Rust-React boundary
- **docs/user/** — user-facing product documentation (getting started, config reference, shortcuts)

## Tech Stack

- **Tauri v2** (Rust backend + webview frontend)
- **Vite + React + TypeScript** (frontend)
- **Tailwind CSS** (styling)
- **Zustand** (state management)
- **xterm.js** (interactive/fullscreen mode only — NOT the primary renderer)
- **pnpm** (package manager)

## Core Architecture (Dual-Mode)

**Normal mode (95% of usage):** User types in a fixed bottom input. Command runs through a persistent PTY shell. Rust parses the PTY stream (OSC 133 markers for block boundaries, ANSI codes for styling) and sends structured data to React. Output renders as styled React components in visual blocks. This is NOT xterm.js — it's DOM text.

**Interactive mode:** When a program activates alt screen (`ESC[?1049h`), the UI switches to fullscreen xterm.js with raw PTY passthrough. When the program exits alt screen, it returns to normal mode.

## Design Priorities

1. Readability — output is content worth designing for
2. User experience — keyboard-first, minimal chrome, full-width content
3. Performance — virtualized rendering, stream throttling, block buffer caps

## UI Model

- No tab bar — sessions switch via `Cmd+E` popup (JetBrains-style fuzzy switcher)
- No sidebar — maximum content space
- Thin header + scrollable blocks + fixed bottom input
- Command palette via `Cmd+P`

## Platform Targets

- macOS (Apple Silicon)
- Windows 11+
- Linux (Wayland)

## Conventions

- All commands use `pnpm`
- Rust code lives in `src-tauri/`
- Frontend code lives in `src/`
- Config format is TOML
- Shell integration scripts go to `~/.config/kiln/shell/`
- License: MIT

## Documentation Rules

When implementing or modifying a user-facing feature, you MUST update the corresponding docs in `docs/user/`:
- New feature → add or update the relevant doc page
- Changed behavior → update the doc to match
- New keyboard shortcut → add to `docs/user/shortcuts.md`
- New config option → add to `docs/user/configuration.md`

Docs are part of the definition of done. A feature without updated docs is not complete.

## Website Presence

This project is featured on cristianllanos.com. When tagging a release:
1. Run `/project-site` to sync docs, changelog, API reference, and version to the website
2. Run `/seo-audit` to verify SEO coverage

The project's `docs/user/` is the staging area — updated during development. The website is production — only updated on release via `/project-site`.

## Workflow

- After completing each roadmap section, run `/simplify` to review and clean up the code before moving on
- Before any release or commit, run a security audit (secrets, CSP, injection, .gitignore coverage) and fix all findings
- Use agents for implementation work to preserve context; report short summaries
- Parallelize independent work across agents when files don't conflict
- When parallel agents must touch the same file, designate one as owner — the other exports its work for manual wiring after both complete
- Always run a combined `pnpm tauri build` after merging parallel agent output to catch integration issues
- If a component has early returns (loading/gating states) above hooks like `useVirtualizer`, split into a thin shell component + inner component to avoid React hooks-order violations
- Batch features by dependency: independent items in parallel, dependent items sequential
- Print `--- BATCH N DONE ---` markers when running multiple batches to track progress

## Phase 1 Implementation Order

See ROADMAP.md for the numbered implementation sequence.
