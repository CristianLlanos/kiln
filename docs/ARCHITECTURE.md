# Architecture

## Overview

Kiln has two layers: a Rust backend (Tauri) that manages PTY sessions and parses byte streams, and a React frontend that renders the UI. They communicate via Tauri's IPC (commands and events).

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                     │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌──────────┐  │
│  │ BlockList │  │  Input   │  │ Header │  │ Switcher │  │
│  │          │  │          │  │        │  │  (Cmd+E) │  │
│  │ Block[]  │  │ chat-    │  │ session│  │  popup   │  │
│  │ rendered │  │ style    │  │ name   │  │          │  │
│  │ as React │  │ fixed    │  │        │  │          │  │
│  │ spans    │  │ bottom   │  │        │  │          │  │
│  └──────────┘  └──────────┘  └────────┘  └──────────┘  │
│                        │                                 │
│                   Zustand Store                          │
│           (sessions, blocks, UI state)                   │
└────────────────────────┬────────────────────────────────┘
                         │ Tauri IPC
                         │ Commands: execute_command, create_session, etc.
                         │ Events: block_output, block_complete, mode_switch
┌────────────────────────┴────────────────────────────────┐
│                    Backend (Rust/Tauri)                   │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Session Mgr  │  │ Stream Parser│  │ Config Mgr   │  │
│  │              │  │              │  │              │  │
│  │ PTY lifecycle│  │ OSC 133      │  │ TOML load    │  │
│  │ per session  │  │ Alt screen   │  │ hot-reload   │  │
│  │              │  │ ANSI codes   │  │ file watch   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
│         │                 │                              │
│         │    ┌────────────┴──────┐                       │
│         └───>│   PTY (per shell) │                       │
│              │   persistent      │                       │
│              │   /bin/zsh        │                       │
│              └───────────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

## Data Flow: Keystroke to Rendered Block

### Normal Mode (command execution)

```
1. User types "git status" in Input component
2. User presses Enter
3. Frontend calls Tauri command: execute_command(session_id, "git status")
4. Rust writes "git status\n" to the session's PTY
5. Shell executes, output flows through PTY byte stream
6. Stream Parser reads PTY bytes in a loop:
   a. Detects OSC 133 "command started" marker → emits block_start event
   b. Parses ANSI escape codes → converts to StyledSegment structs
   c. Batches segments every 16ms → emits block_output event
   d. Detects OSC 133 "command finished" marker → emits block_complete event
      (includes exit code, cwd, duration)
7. Frontend receives events:
   a. block_start → creates new Block in Zustand store, status: 'running'
   b. block_output → appends StyledSegments to block, React re-renders
   c. block_complete → updates block status/exitCode/duration, re-activates input
8. React renders each StyledSegment as a <span> with CSS styles
```

### Interactive Mode (vim, htop, etc.)

```
1. User types "vim file.txt" → same flow as above through step 5
2a. Alt screen path: Stream Parser detects ESC[?1049h / ?1047h / ?47h
2b. Force-interactive path: execute_command checks first token against
    config.shell.interactive_commands, sets force_interactive flag on
    SessionSync. Parser picks up the flag before processing output.
3. Parser enters interactive mode, starts buffering pty_stream data
4. Emits mode_switch event: { mode: 'interactive' }
5. Frontend:
   a. Hides block list and input
   b. Mounts fullscreen xterm.js instance
   c. Calls interactive_ready(session_id) → backend replays buffered data
   d. Connects xterm.js directly to PTY via streaming IPC
6. All keyboard input goes through xterm.js → PTY (raw passthrough)
7. User exits vim → program sends ESC[?1049l / ?1047l / ?47l
8. Stream Parser detects alt screen exit
9. Emits mode_switch event: { mode: 'normal' }
10. Frontend:
    a. Unmounts xterm.js
    b. Shows block list and input
    c. Block for "vim file.txt" finalizes with exit code
```

### Stdin During Running Commands

```
1. Command is running (e.g., sudo asks for password)
2. Input area shows "input goes to running process" state
3. User types password → keystrokes route directly to PTY
4. PTY receives input, command continues
5. No special handling needed — PTY does the work
```

## Component Responsibilities

### Rust Backend

| Component | Responsibility |
|---|---|
| **Session Manager** | Creates/destroys PTY sessions, manages lifecycle per window |
| **PTY** | Persistent shell process (`portable-pty`), reads/writes byte stream |
| **Stream Parser** | Reads PTY bytes, detects OSC 133 markers, alt screen, ANSI codes. Converts to structured events. Batches output at 16ms intervals. Enforces block buffer cap (50k lines). |
| **Config Manager** | Loads TOML config, watches for changes, emits config_changed events |
| **Shell Integration** | Ships shell scripts to `~/.config/kiln/shell/`, manages installation |

### React Frontend

| Component | Responsibility |
|---|---|
| **Zustand Store** | Holds sessions[], blocks[], activeSession, uiState (mode, search, etc.) |
| **BlockList** | Virtualized list of Block components. Handles auto-scroll behavior. |
| **Block** | Single command+output card. Renders StyledSegments as spans. Handles collapse/expand. Shows status (running/success/error/interrupted), duration, cwd. |
| **Input** | Fixed bottom input. Routes to PTY when command is running. |
| **Header** | App name, active session name, shortcut hint. |
| **SessionSwitcher** | `Cmd+E` popup. Fuzzy filter, keyboard navigation. |
| **CommandPalette** | `Cmd+P` popup. Action search and execution. |
| **Search** | `Cmd+F` bar. Regex support, match navigation, auto-expand collapsed blocks. |
| **InteractiveMode** | Fullscreen xterm.js wrapper. Mounts/unmounts on mode switch. |

## Tauri IPC Contract

### Commands (Frontend → Rust)

| Command | Args | Returns | Description |
|---|---|---|---|
| `create_session` | `window_id` | `session_id` | Spawn new PTY shell |
| `close_session` | `session_id` | — | Kill PTY, cleanup |
| `execute_command` | `session_id, command` | — | Write command to PTY |
| `write_stdin` | `session_id, data` | — | Send raw input to PTY |
| `resize_pty` | `session_id, cols, rows` | — | Resize PTY dimensions |
| `get_config` | — | `Config` | Get current config |
| `interactive_ready` | `session_id` | `base64 data` | Signal xterm.js is mounted, get buffered data |
| `install_shell_integration` | `shell` | `Result` | Install shell hooks |

### Events (Rust → Frontend)

| Event | Payload | Description |
|---|---|---|
| `block_start` | `{ session_id, block_id, command, cwd, timestamp }` | New block started |
| `block_output` | `{ session_id, block_id, segments: StyledSegment[] }` | Batched output (16ms) |
| `block_complete` | `{ session_id, block_id, exit_code, duration }` | Command finished |
| `mode_switch` | `{ session_id, mode: 'normal' | 'interactive' }` | Alt screen toggle |
| `session_error` | `{ session_id, error }` | PTY crash or error |
| `session_cwd` | `{ session_id, cwd }` | Working directory changed (OSC 7) |
| `config_changed` | `{ config: Config }` | Config file changed |
| `pty_stream` | `{ session_id, data: bytes }` | Raw PTY data (interactive mode only) |

## Shell Integration (OSC 133)

The zsh integration script emits these markers around commands:

```zsh
# Simplified — actual script handles edge cases
kiln_preexec() {
  # Mark: command is about to execute
  printf '\e]133;C\e\\'
}

kiln_precmd() {
  local exit_code=$?
  # Mark: command finished, with exit code and cwd
  printf '\e]133;D;%s\e\\' "$exit_code"
  printf '\e]133;A\e\\'
  # Mark: prompt is being displayed (ready for input)
  printf '\e]133;B\e\\'
}
```

The stream parser watches for these sequences:
- `OSC 133;A` — prompt start (ready for input)
- `OSC 133;B` — prompt end (user is typing)
- `OSC 133;C` — command start (command is executing)
- `OSC 133;D;{exit_code}` — command finish

## File Structure (Expected)

```
kiln/
  src/                    # React frontend
    components/
      BlockList.tsx
      Block.tsx
      Input.tsx
      Header.tsx
      SessionSwitcher.tsx
      CommandPalette.tsx
      Search.tsx
      InteractiveMode.tsx
    store/
      index.ts            # Zustand store
      types.ts            # Block, StyledSegment, Session types
    hooks/
      useTauriEvents.ts   # Subscribe to Rust events
      useAutoScroll.ts
      useKeyboardShortcuts.ts
    lib/
      ansi.ts             # ANSI-to-CSS utilities (if any client-side parsing needed)
    App.tsx
    main.tsx
  src-tauri/              # Rust backend
    src/
      main.rs
      session.rs          # Session manager + PTY lifecycle
      parser.rs           # Stream parser (OSC 133, alt screen, ANSI)
      config.rs           # TOML config + hot-reload
      commands.rs         # Tauri command handlers
      shell_integration.rs # Shell script management
    shell/
      kiln.zsh            # Zsh integration script
  docs/
    DECISIONS.md
    ARCHITECTURE.md
  CLAUDE.md
  ROADMAP.md
  LICENSE
```
