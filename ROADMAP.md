# Kiln - Command Runner

A modern command runner for developers who live in the terminal every day. We deserve better readability and user experience.

Kiln is not a terminal emulator — it's a beautiful UI for running commands and interacting with their output. Think chat-style interface for your shell: type a command, see the output rendered with great typography, easy copying, search, and rich previews.

When you need a full terminal (vim, htop, ssh), Kiln seamlessly switches to an embedded terminal and returns to the rich UI when you're done.

Privacy-first, no accounts, no telemetry. Open source and contributor-friendly.

## Tech Stack

- **Framework:** Tauri v2 (Rust backend + webview frontend)
- **Frontend:** Vite + React + TypeScript
- **Rendering:** React components with ANSI-to-CSS conversion (normal mode), xterm.js WebGL (interactive mode)
- **Styling:** Tailwind CSS
- **State:** Zustand
- **Package Manager:** pnpm
- **License:** MIT

## Platform Targets

- macOS (Apple Silicon)
- Windows 11+
- Linux (Wayland)

## Architecture: Dual-Mode UI

### Normal Mode (primary experience)
Commands are typed in a fixed bottom input. Output is rendered as styled React components — rich text, not a character grid. Each command+output is a visual block. Copying, searching, and reading are native and effortless.

### Interactive Mode (fullscreen terminal)
When a program activates alt screen (`ESC[?1049h`) — e.g. vim, htop, ssh, nano, less, man — the UI switches to a fullscreen xterm.js terminal with raw PTY passthrough. When the program exits alt screen, the UI returns to normal mode.

Detection is automatic via alt screen escape sequences. No command allowlist needed.

### Command Execution Pipeline

```
Input (React) → PTY (Rust, persistent shell) → Stream Parser (Rust) → React Blocks
```

- **Persistent PTY shell** — a long-lived shell session (zsh) where state persists: `cd`, env vars, aliases, `.zshrc` all work naturally
- **Shell integration via OSC 133** — small shell hooks (`precmd`/`preexec`) emit invisible marker sequences into the PTY stream to delimit command boundaries, exit codes, and working directory
- **Stream parser** — Rust-side parser reads the PTY byte stream, detects OSC 133 markers (block boundaries), alt screen sequences (mode switch), and ANSI codes (styling), then sends structured data to the frontend
- **Graceful degradation** — without shell integration, the session falls back to a continuous xterm.js terminal view

### Shell Integration Support

| Shell | Status    | Mechanism                          |
|-------|-----------|------------------------------------|
| zsh   | Phase 1   | `precmd` / `preexec` hooks         |
| bash  | Phase 1   | `PROMPT_COMMAND` / `DEBUG` trap    |
| fish  | Phase 1   | `fish_prompt` / `fish_preexec`     |

### Block Data Model

Each command execution produces one block:

```typescript
interface Block {
  id: string                  // unique identifier
  command: string             // what the user typed
  output: StyledSegment[]     // parsed ANSI output as styled spans
  exitCode: number | null     // null while running
  cwd: string                 // working directory when command ran
  timestamp: number           // when the command was executed
  duration: number | null     // ms, null while running
  status: 'running' | 'success' | 'error' | 'interrupted'
  collapsed: boolean          // auto-collapse when output > 50 lines
}

interface StyledSegment {
  text: string
  style: {
    fg?: string
    bg?: string
    bold?: boolean
    italic?: boolean
    underline?: boolean
    dim?: boolean
  }
}
```

### Block UX Behaviors

**Streaming output:**
- Auto-scroll follows output as it arrives (like `tail -f`)
- User scrolling up pauses auto-scroll; "jump to bottom" button appears
- Scrolling back to bottom resumes auto-scroll
- While running: spinner/dot indicator, live ticking duration, blinking cursor at end of output
- Input area shows "input goes to running process" state

**On completion:**
- Timer stops, shows final duration
- Status shows exit code: `✓ 0` (success), `✗ 1` (error), `⚠ 130` (interrupted/Ctrl+C)
- Input area re-activates for next command

**Auto-collapse:**
- Output exceeding ~50 lines (configurable) auto-collapses
- Shows first few lines + line count badge `[200+ lines]`, click to expand
- User can collapse/expand any block manually

**Empty output:**
- Commands with no output (e.g. `cd`) show a minimal one-line block: command + checkmark

**Stdin routing:**
- Keyboard input always routes to the active PTY while a command is running
- `sudo`, `ssh`, `[y/N]` prompts — just type, it goes through
- No pattern detection needed; the output already shows the prompt text

**Ctrl+C:**
- Sends SIGINT through PTY as usual
- Block finalizes with interrupted status (warning color, not error)

**Session awareness:**
- Background sessions continue streaming and buffering output
- Session switcher shows activity indicator for sessions with running commands

### Performance Guardrails

| Layer | Limit | Default |
|---|---|---|
| Block buffer (Rust) | Max lines per block | 50,000 |
| DOM rendering (React) | Virtualized, only viewport visible | ~100 nodes |
| Stream throttle (Rust) | Batched updates | 16ms / ~60fps |
| Collapse threshold (UI) | Auto-collapse long output | 50 lines |

- **Block buffer:** when exceeded, keep first 100 + last N lines, drop middle with `[... X lines truncated ...]` marker. Happens in Rust before reaching React.
- **Virtualized rendering:** only lines in the viewport + small buffer are in the DOM. Uses `react-window` or `@tanstack/virtual`.
- **Stream throttle:** Rust batches output into 16ms frames, sends one update per frame to frontend.
- All limits configurable in TOML config.

## Design Principles

- **Readability first** — output is content worth designing for
- **Block-based** — each command and its output is a visually distinct block
- **Generous whitespace** — content breathes, muted chrome, content is the star
- **Clear hierarchy** — instantly distinguish prompts, output, errors, and system messages
- **Seamless transitions** — interactive mode feels natural, not jarring

## UI Layout

```
┌──────────────────────────────────────────┐
│ [≡] Kiln     kiln             [Cmd+E]   │  ← thin header
├──────────────────────────────────────────┤
│  ┌─ block ────────────────────────────┐  │
│  │ $ git status                       │  │
│  │ modified: App.tsx                  │  │
│  └────────────────────────────────────┘  │
│  ┌─ block ────────────────────────────┐  │
│  │ $ pnpm test                        │  │
│  │ PASS 3/3                           │  │
│  └────────────────────────────────────┘  │
│                                          │
├──────────────────────────────────────────┤
│  > type command here...                  │
└──────────────────────────────────────────┘
```

- **Header** — minimal: app name, active session name, `Cmd+E` shortcut hint
- **Main area** — full-width scrollable block-based output
- **Input** — fixed at the bottom (chat-style)
- **No tab bar** — sessions are managed via the switcher popup
- **No sidebar** — maximum screen space for content

### Session Switcher (`Cmd+E` / `Ctrl+E`)

JetBrains-style popup for switching between sessions:

```
┌─ Recent Sessions ──────────────────────────┐
│ 🔍 filter...                               │
│                                            │
│ ● kiln                    ~/Code/kiln      │
│   pnpm dev • running                      │
│                                            │
│ ○ api-server              ~/Code/api       │
│   git push • 2m ago                       │
│                                            │
│ ○ dotfiles                ~/dotfiles       │
│   vim .zshrc • 15m ago                    │
└────────────────────────────────────────────┘
```

- **Instant fuzzy filter** — type to filter by session name, cwd, or last command
- **Keyboard-first** — Up/Down to navigate, Enter to switch, Escape to close
- **Double-press** `Cmd+E` to filter to sessions with running commands
- **Delete** on a selection closes that session
- **`Cmd+N`** from within the popup creates a new session
- Each entry shows: status dot, session name, working directory, last command + time ago

### Windows & Sessions

- **Multiple windows** — `Cmd+N` opens a new window with a fresh session
- **Sessions belong to their window** — each window manages its own session pool
- **`Cmd+E`** switches sessions within the current window
- **Session persistence** (Phase 3) restores windows + their sessions

### Command Palette (`Cmd+P` / `Ctrl+P`)

Universal entry point for all actions — if you don't know the shortcut, the palette will find it.

Actions include:
- **Session** — new session, restart session, close session, rename session
- **Window** — new window
- **View** — clear session output, toggle theme
- **Navigation** — search commands in history, jump to block
- **Settings** — open config file, reload config
- **Shell integration** — install/fix shell integration

### Search (`Cmd+F`)

- Searches **current session only**
- Highlights all matches across blocks with match counter ("3 of 17")
- Enter / Shift+Enter to jump between matches
- Auto-expands collapsed blocks that contain matches
- Regex toggle
- Search bar appears at the top of the viewport

### Core Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+N` | New window |
| `Cmd+E` | Session switcher |
| `Cmd+P` | Command palette |
| `Cmd+F` | Search output |

### First-Run Experience

1. **Detect shell** — read `$SHELL` to determine zsh/bash/fish
2. **Welcome block** — a single block explaining what Kiln needs, showing the exact line that will be added to `.zshrc`:
   ```
   source ~/.config/kiln/shell/kiln.zsh
   ```
3. **"Install & Start"** — writes the integration script to `~/.config/kiln/shell/`, appends the `source` line to the shell config, spawns the session
4. **"Skip"** — launches in fallback mode (xterm.js, no blocks). Persistent hint that block mode is available.

Principles:
- **Transparent** — show exactly what changes, no hidden modifications
- **One-click** — don't make users manually edit files
- **Reversible** — source line is harmless if Kiln is uninstalled (file won't exist, shell silently skips)
- **No account, no tour** — one screen, get to work
- Subsequent launches skip straight to a ready session

### Error Handling

**Shell crashes / PTY dies:**
- Current block finalizes with error state
- System message appears inline as a block (not a modal or toast)
- Previous blocks are preserved — history is not lost
- User can `[Restart session]` or `[New session]`

**Shell integration missing or broken:**
- If OSC 133 markers stop arriving, fall back to xterm.js for that session
- Subtle header notification: "Block mode unavailable — [Fix]"
- "Fix" re-runs the install flow

**Command hangs / unresponsive:**
- Block shows running state (spinner, ticking duration) — user knows it's alive
- `Ctrl+C` always works (SIGINT via PTY)
- No automatic timeout — long commands (e.g. compilation) are normal

**Tauri backend crash:**
- Webview stays alive, shows error screen: "Kiln encountered an error. [Restart]"
- Session history in the view is preserved (React state)
- Running PTY sessions are lost (unavoidable)

**Small error surface — no network, no accounts, no APIs.** Only failure points: shell/PTY, file system, Tauri IPC.

## Color Palette (Kotlin-Inspired Dark Theme)

| Role             | Hex       |
|------------------|-----------|
| Background       | `#0F0F14` |
| Surface          | `#16161E` |
| Surface raised   | `#1E1E28` |
| Border           | `#2A2A3A` |
| Text primary     | `#E8E8F0` |
| Text secondary   | `#8888A0` |
| Accent primary   | `#7F52FF` |
| Accent secondary | `#B125EA` |
| Error            | `#E24462` |
| Success          | `#4ADE80` |

---

## Phase 1: Core (MVP)

### Implementation Order

Build in this sequence — each step builds on the previous:

1. **Project scaffold** — Tauri v2 + Vite + React + TypeScript + Tailwind + Zustand. Verify it builds and opens a window on all target platforms.
2. **PTY session** — Rust spawns a persistent `/bin/zsh` via `portable-pty`. Frontend can send a command string and receive raw bytes back via Tauri events. Prove it works with a plain text dump in the UI.
3. **Shell integration** — Write the `kiln.zsh` script (OSC 133 markers). Install it. Verify markers appear in the PTY byte stream.
4. **Stream parser** — Rust-side parser that reads PTY bytes, detects OSC 133 block boundaries, parses ANSI codes into `StyledSegment` structs, batches at 16ms, and sends structured events to frontend. This is the hardest piece.
5. **Block rendering** — React `Block` component that renders `StyledSegment[]` as styled `<span>` elements. Zustand store for sessions and blocks. At this point you can run commands and see styled output in blocks.
6. **Input area** — Fixed bottom input, command submission, stdin routing to active PTY while a command is running.
7. **Block UX** — Auto-scroll, auto-collapse, empty output handling, running/success/error/interrupted states, duration timer.
8. **Interactive mode** — Alt screen detection, fullscreen xterm.js mount/unmount, seamless transitions.
9. **Virtualized rendering** — Integrate `react-window` or `@tanstack/virtual` for large block output. Block buffer cap in Rust.
10. **UI chrome** — Header bar, dark theme (colors, font, spacing).
11. **Session management** — Multiple sessions per window, session switcher popup (`Cmd+E`).
12. **Multiple windows** — `Cmd+N` opens new window with its own session pool.
13. **First-run experience** — Shell detection, welcome block, one-click install flow, fallback mode.
14. **Error handling** — PTY crash recovery, backend crash screen, missing integration detection.
15. **Configuration** — TOML config, hot-reload, font override, keybindings.
16. **Open source setup** — README, CONTRIBUTING.md, issue templates, LICENSE.
17. **First release** — Tag v0.1.0, run `/project-site` to create Kiln pages on cristianllanos.com, run `/seo-audit`.

### Infrastructure
- [x] Tauri v2 project scaffold with Vite + React + TypeScript
- [x] Persistent PTY shell session via Rust backend (`portable-pty`)
- [x] Zsh shell integration script (OSC 133 markers via `precmd`/`preexec`)
- [x] Stream parser — detect OSC 133 block boundaries, alt screen, ANSI codes
- [x] ANSI escape sequence conversion to styled React output
- [x] Stream throttle — batch PTY output into 16ms frames before sending to frontend
- [x] Block buffer cap — truncate output beyond 50k lines (configurable), keep head + tail
- [x] Graceful degradation — fallback to xterm.js when shell integration is unavailable

### Dual-Mode Rendering
- [x] Normal mode — render command output as styled React components in blocks
- [x] Virtualized block rendering — only viewport lines in the DOM (`react-window` or `@tanstack/virtual`)
- [x] Interactive mode — fullscreen xterm.js with raw PTY passthrough
- [x] Alt screen detection (`ESC[?1049h` / `ESC[?1049l`) for automatic mode switching
- [x] Seamless transition between modes

### UI Shell
- [x] Block-based output — each command+output as a distinct visual card
- [x] Fixed bottom input area (chat-style)
- [x] Thin header bar (app name, active session, shortcut hint)
- [x] Session switcher popup (`Cmd+E`) — fuzzy filter, keyboard-driven, JetBrains-style
- [x] Multiple windows support (`Cmd+N`) — each window with its own session pool
- [x] Kotlin-inspired dark theme

### First-Run & Error Handling
- [x] Shell detection and welcome block with one-click integration install
- [x] Shell integration script deployed to `~/.config/kiln/shell/`
- [x] Graceful fallback to xterm.js when integration is missing or broken
- [x] PTY crash recovery — inline system message with restart/new session options
- [x] Tauri backend crash — error screen with restart action

### Open Source
- [x] README.md — what Kiln is, screenshot/gif, quick start (clone, install, run)
- [x] CONTRIBUTING.md — dev environment setup, project structure, how to submit PRs
- [x] GitHub issue templates — bug report, feature request
- [x] LICENSE (MIT)

### User Documentation (`docs/user/`)
- [x] `getting-started.md` — install, first launch, shell integration setup
- [x] `shortcuts.md` — all keyboard shortcuts with descriptions
- [x] `configuration.md` — full config reference with examples
- [x] `sessions.md` — how sessions and windows work, switcher usage

Docs are part of the definition of done: every feature implementation must include corresponding doc updates.

### Configuration
- [x] TOML config file with hot-reload
- [x] Embedded default font (JetBrains Mono) with custom font override
- [x] Configurable keybindings

Default config schema:

```toml
[shell]
program = "/bin/zsh"            # auto-detected from $SHELL
args = []
interactive_commands = ["vim", "nvim", "vi", "htop", "top", "claude", "ssh", "less", "man", "nano", "emacs"]

[appearance]
font_family = "JetBrains Mono"  # or path to custom font
font_size = 14
theme = "kiln-dark"
collapse_threshold = 50         # lines before auto-collapse
previews = true                 # rich previews for JSON, diff, CSV, etc.

[scrollback]
max_lines = 10000

[performance]
max_lines_per_block = 50000
stream_throttle_ms = 16

[keybindings]
session_switcher = "super+e"
command_palette = "super+p"
search = "super+f"
new_window = "super+n"
new_session = "super+shift+n"
close_session = "super+w"

[updates]
check_on_launch = true    # set false to disable
```

## Phase 2: High Value

### Build & Release
- [x] GitHub Actions CI — lint (eslint + clippy), test, build check on PR/push
- [x] Release pipeline via Tauri GitHub Action — tag triggers builds for all 3 platforms
  - macOS ARM: `.dmg`
  - Windows: `.msi`
  - Linux: `.AppImage` / `.deb`
- [x] Tauri updater manifest auto-generated on release

### Shell Integration
- [x] Bash shell integration (`PROMPT_COMMAND` / `DEBUG` trap)
- [x] Fish shell integration (`fish_prompt` / `fish_preexec`)

### Features
- [x] Rich output previews — toggle per block, raw output always available
  - JSON: syntax-highlighted, collapsible tree
  - Git diff: syntax-highlighted with +/- colors
  - CSV/TSV: rendered as a table
  - Markdown: rendered with toggle to raw
  - Column-aligned output (e.g. `docker ps`): cleaned up table
- [x] Search through output with regex support (DOM-native, fast)
- [x] Command palette (`Cmd+P` / `Ctrl+P`) — all actions discoverable
- [x] Clickable links/paths — detect URLs and file paths
- [x] Autocomplete — dropdown above input area, keyboard-navigable
  - Source: `~/.zsh_history`, live session history, filesystem path completion (via Rust backend)
- [x] Modern text editing in input area (multi-line, syntax hints)
- [x] Scrollback (configurable, default 10,000 lines)
- [x] Copy enhancements — copy block output, copy as markdown, copy command only

## Phase 2.5: UX Polish

### Autocomplete
- [x] File path autocomplete for bare names — always mix filesystem + history completions, not just path-prefixed tokens (`/`, `./`, `../`, `~/`)
- [x] Tab/arrow key isolation — arrows own the completion list when visible; history navigation only when completions are dismissed
- [x] Completion list stays open during debounce re-fetch while arrows are active

### Input & Focus
- [x] Global keyboard capture — typing anywhere focuses the input (unless overlay is open or in interactive mode)
- [x] Cwd indicator above input — small muted line showing current working directory, always visible while typing
- [x] Input resize handle — draggable grip at top of input area to expand beyond the 6-line auto-grow limit
- [x] History position indicator — subtle "2 of 15" counter when navigating history with arrows

### Previews
- [x] Previews enabled by default — `showPreview` defaults to `true` when content type is detected
- [x] Config opt-out — `appearance.previews = true` (default), set `false` to disable globally
- [x] Size guard — skip preview detection when plain text exceeds 100KB to prevent parsing crashes

### Bug Fixes
- [x] Rename session — replace `window.prompt()` with inline rename UI (prompt doesn't work reliably in Tauri webview); trigger from command palette should focus the header rename field
- [x] Clear session output bound to `Ctrl+L` — standard terminal keybinding, in addition to the command palette action
- [x] Circular arrow navigation in command palette and session switcher — ArrowUp at top wraps to bottom, ArrowDown at bottom wraps to top

### Interactive Mode Fixes
- [x] Buffer and replay — backend buffers `pty_stream` data after `mode_switch` until frontend signals `interactive_ready`, then replays. Fixes vim/htop content delay on mount.
- [x] Detect all alt screen variants — trigger interactive mode on `ESC[?1047h` and `ESC[?47h` in addition to `ESC[?1049h`
- [x] Configurable force-interactive commands — `shell.interactive_commands` list of command prefixes that bypass alt screen detection and go straight to interactive mode
- [x] Scan for all alt screen exit variants when leaving interactive mode

### Visual Feedback
- [x] Ctrl+C visual feedback — brief inline hint confirming SIGINT was sent
- [x] Block timestamps — relative time ("2m ago") in block header, absolute time on hover
- [x] Richer empty state — show cwd and shortcut hints (Cmd+E, Cmd+P) instead of just "Ready."

## Phase 3: Nice to Have

- [ ] Light theme + custom color schemes
- [ ] Session persistence — restore windows/sessions after restart
- [ ] Notifications when long-running commands finish
- [ ] Auto-updater via Tauri updater plugin + GitHub Releases
  - Check on launch, subtle header notification, no forced updates
  - Config option to disable update checks

## Future Exploration

- Code signing (macOS + Windows) — add when distributing to non-technical users
- Inline image rendering (sixel or iTerm2 protocol)

## Non-Goals

- No account/sign-in system
- No cloud sync
- No AI features (use Claude CLI separately)
- No telemetry or data collection
- No split panes — sessions + switcher is the navigation model
- No tab bar — session switcher replaces tabs
- No sidebar — maximum content space, navigation via keyboard shortcuts
