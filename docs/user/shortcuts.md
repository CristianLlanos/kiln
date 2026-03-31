# Keyboard Shortcuts

All shortcuts use `Cmd` on macOS and `Ctrl` on Windows/Linux.

## Sessions

| Shortcut | Action |
|---|---|
| `Cmd+E` | Open session switcher |
| `Cmd+E` (double-press) | Filter switcher to running sessions only |
| `Cmd+T` | Create new session |
| `Cmd+Shift+N` | Create new session (alternative) |
| `Cmd+W` | Close active session |
| `F2` | Rename active session |

## Within Session Switcher

| Shortcut | Action |
|---|---|
| `↑` / `↓` | Navigate session list (wraps around) |
| `Enter` | Switch to selected session |
| `Escape` | Close switcher |
| `F2` | Rename selected session (inline) |
| `Delete` / `Backspace` (empty filter) | Close selected session |
| `Cmd+N` | Create new session |
| Double-click name | Rename session (inline) |
| Type anything | Fuzzy filter by name, directory, or command |

## Command Palette

| Shortcut | Action |
|---|---|
| `Cmd+P` | Open command palette |
| `↑` / `↓` | Navigate action list (wraps around) |
| `Enter` | Execute selected action |
| `Escape` | Close palette |
| Type anything | Fuzzy filter by category or action name |

## Search

| Shortcut | Action |
|---|---|
| `Cmd+F` | Open / close search bar |
| `Enter` | Jump to next match |
| `Shift+Enter` | Jump to previous match |
| `Escape` | Close search bar |

The search bar includes a regex toggle button (`.*`). When regex mode is enabled, the query is interpreted as a regular expression.

## Autocomplete

| Shortcut | Action |
|---|---|
| `Tab` | Fill longest common prefix, then cycle through options |
| `↑` / `↓` | Navigate completion list (when visible) |
| `Enter` | Accept selected completion (only after Tab or arrow interaction) |
| `Escape` | Dismiss completion dropdown |

Completions appear automatically after a short delay while typing. Pressing `Tab` triggers an immediate completion fetch — it fills in as many characters as possible (the longest common prefix shared by all matches), then shows the remaining options. Subsequent `Tab` presses cycle through individual options. `Enter` accepts the selected completion only if you have actively interacted with the dropdown (via `Tab` or arrows); otherwise `Enter` executes the command as typed.

Both filesystem completions (files first, then directories, sorted alphabetically) and history completions are shown together. Files in the current working directory match bare names — you don't need to type `./`.

When the completion dropdown is visible, arrow keys navigate the list exclusively — they will not trigger history navigation until the dropdown is dismissed.

## Input

Typing anywhere in the window automatically focuses the command input — no need to click it first. This does not apply when an overlay (session switcher, command palette, search) is open, or when in interactive mode.

The current working directory is shown below the input area so you always know where commands will run.

The input area auto-grows up to 6 lines. For longer scripts, drag the grip at the top edge of the input area to expand it further.

When navigating command history with `↑` / `↓`, a position indicator (e.g., "2 of 15") appears below the input.

## Windows

| Shortcut | Action |
|---|---|
| `Cmd+N` | Open a new window |

## Command Execution

| Shortcut | Action |
|---|---|
| `Enter` | Execute command |
| `Ctrl+C` | Send interrupt (SIGINT) to running command — a brief `^C` confirmation appears below the input |
| `Ctrl+L` | Clear session output (same as the command palette action) |
| `Cmd+I` | Toggle interactive mode (fullscreen terminal) |

## Block Actions

Each command block shows action buttons on hover:

| Button | Action |
|---|---|
| `Output` | Copy the command's output to clipboard |
| `Cmd` | Copy the command text to clipboard |
| `MD` | Copy as Markdown (command + output) |
| `Raw` / `Preview` | Toggle between raw output and rich preview (when detected) |

Rich previews are shown by default for JSON, diff, CSV/TSV, YAML, SQL, Markdown, and column-aligned tables. Previews are detected automatically by file extension (e.g., `cat file.json`) or by content heuristics. Each block can be toggled individually; set `appearance.previews = false` in config to disable globally.
