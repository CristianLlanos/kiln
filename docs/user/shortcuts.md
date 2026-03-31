# Keyboard Shortcuts

All shortcuts use `Cmd` on macOS and `Ctrl` on Windows/Linux.

## Sessions

| Shortcut | Action |
|---|---|
| `Cmd+E` | Open session switcher |
| `Cmd+E` (double-press) | Filter switcher to running sessions only |
| `Cmd+Shift+N` | Create new session |
| `Cmd+W` | Close active session |

## Within Session Switcher

| Shortcut | Action |
|---|---|
| `↑` / `↓` | Navigate session list |
| `Enter` | Switch to selected session |
| `Escape` | Close switcher |
| `Delete` / `Backspace` (empty filter) | Close selected session |
| `Cmd+N` | Create new session |
| Type anything | Fuzzy filter by name, directory, or command |

## Command Palette

| Shortcut | Action |
|---|---|
| `Cmd+P` | Open command palette |
| `↑` / `↓` | Navigate action list |
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
| `Tab` | Accept the top/selected completion |
| `↑` / `↓` | Navigate completion list (when visible) |
| `Enter` | Accept selected completion (when visible) |
| `Escape` | Dismiss completion dropdown |

Completions appear automatically after a short delay while typing. Filesystem completions trigger when the input contains a path-like token (starting with `/`, `./`, `../`, or `~/`). Otherwise, history completions are shown from both the current session and your shell history file.

## Command Execution

| Shortcut | Action |
|---|---|
| `Enter` | Execute command |
| `Ctrl+C` | Send interrupt (SIGINT) to running command |
