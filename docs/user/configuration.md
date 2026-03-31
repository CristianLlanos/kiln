# Configuration

Kiln uses a TOML configuration file located at:

```
~/.config/kiln/config.toml
```

On first launch, Kiln creates this file with sensible defaults. You can edit it in any text editor -- changes are picked up automatically (hot-reload).

## Opening the Config File

From the command palette (`Cmd+P`), select **Open Config File**. This opens the file in your system's default text editor.

## Full Reference

### `[shell]`

| Option    | Type       | Default        | Description                               |
|-----------|------------|----------------|-------------------------------------------|
| `program` | `string`   | `$SHELL` or `"/bin/zsh"` | Path to the shell binary         |
| `args`    | `string[]` | `[]`           | Arguments passed to the shell on startup  |
| `interactive_commands` | `string[]` | `["vim", "nvim", "vi", "htop", "top", "claude", "ssh", "less", "man", "nano", "emacs"]` | Commands that bypass alt screen detection and go straight to fullscreen terminal mode |

```toml
[shell]
program = "/bin/zsh"
args = []
interactive_commands = ["vim", "nvim", "vi", "htop", "top", "claude", "ssh", "less", "man", "nano", "emacs"]
```

Most TUI programs (vim, htop) are detected automatically via alt screen escape sequences (`ESC[?1049h`, `ESC[?1047h`, `ESC[?47h`). The `interactive_commands` list is for programs that don't use alt screen — they go straight to fullscreen terminal mode before any output arrives. Match is on the first token of the command (e.g., `"claude"` matches `claude chat` and `claude code`).

### `[appearance]`

| Option               | Type     | Default            | Description                                        |
|----------------------|----------|--------------------|----------------------------------------------------|
| `font_family`        | `string` | `"JetBrains Mono"` | Font family for all text (must be installed)        |
| `font_size`          | `int`    | `14`               | Font size in pixels                                |
| `theme`              | `string` | `"kiln-dark"`      | Color theme name                                   |
| `collapse_threshold` | `int`    | `50`               | Lines of output before a block auto-collapses      |
| `previews`           | `bool`   | `true`             | Enable rich previews for JSON, diff, CSV, markdown, and tables |

```toml
[appearance]
font_family = "JetBrains Mono"
font_size = 14
theme = "kiln-dark"
collapse_threshold = 50
previews = true
```

When `previews` is enabled (default), blocks with recognized content types are shown as rich previews automatically. Supported types: JSON (collapsible tree), diff (syntax-highlighted), CSV/TSV (table), YAML (syntax-highlighted), SQL (syntax-highlighted), Markdown (rendered), and column-aligned tables. Each block has a "Raw" toggle to switch to plain output. Set `previews = false` to disable rich previews globally. Previews are automatically skipped for outputs larger than 100KB to prevent performance issues.

Content type is detected first by file extension in the command (e.g., `cat data.json`, `cat config.yml`, `cat query.sql`), then by content heuristics as a fallback.

The `font_family` value is used as the primary font in a system monospace font stack. If the specified font is not installed, the system falls back to the next available monospace font.

### `[scrollback]`

| Option      | Type  | Default | Description                        |
|-------------|-------|---------|------------------------------------|
| `max_lines` | `int` | `10000` | Maximum scrollback lines retained  |

```toml
[scrollback]
max_lines = 10000
```

### `[performance]`

| Option                | Type  | Default | Description                                              |
|-----------------------|-------|---------|----------------------------------------------------------|
| `max_lines_per_block` | `int` | `50000` | Max lines per command block before truncation             |
| `stream_throttle_ms`  | `int` | `16`    | Milliseconds between batched output updates (~60fps)      |

```toml
[performance]
max_lines_per_block = 50000
stream_throttle_ms = 16
```

### `[keybindings]`

| Option             | Type     | Default            | Description                      |
|--------------------|----------|--------------------|----------------------------------|
| `session_switcher` | `string` | `"super+e"`        | Open/close session switcher      |
| `command_palette`  | `string` | `"super+p"`        | Open command palette             |
| `search`           | `string` | `"super+f"`        | Search output                    |
| `new_window`       | `string` | `"super+n"`        | Open a new window                |
| `new_session`      | `string` | `"super+shift+n"`  | Create a new session             |
| `close_session`    | `string` | `"super+w"`        | Close the active session         |

```toml
[keybindings]
session_switcher = "super+e"
command_palette = "super+p"
search = "super+f"
new_window = "super+n"
new_session = "super+shift+n"
close_session = "super+w"
```

On macOS, `super` maps to `Cmd`. On Windows and Linux, `super` maps to `Ctrl`.

## Hot Reload

Kiln watches `~/.config/kiln/config.toml` for changes. When the file is saved, the new configuration is loaded and applied immediately -- no restart required. This works with editors that do atomic saves (write to temp file + rename).

If a parse error is detected after saving, Kiln logs a warning and continues using the previous valid configuration. It will never crash due to a malformed config file.

## Examples

### Use a different shell

```toml
[shell]
program = "/bin/bash"
args = ["--login"]
```

### Larger font for presentations

```toml
[appearance]
font_size = 20
```

### Use Fira Code instead of JetBrains Mono

```toml
[appearance]
font_family = "Fira Code"
```

### Increase block buffer for large build logs

```toml
[performance]
max_lines_per_block = 100000
```
