# Getting Started

## First Launch

When you open Kiln for the first time, you will see a welcome screen that explains the shell integration setup.

### Shell Integration

Kiln uses a small shell integration script to parse your command output into structured blocks. This script adds invisible markers to your shell prompt so Kiln can detect where each command starts and ends.

Kiln supports **zsh**, **bash**, and **fish**. It automatically detects your default shell from the `$SHELL` environment variable and installs the matching integration script.

The welcome screen shows you exactly what will happen:

1. **File created:** `~/.config/kiln/shell/kiln.<shell>` -- the integration script (e.g. `kiln.zsh`, `kiln.bash`, or `kiln.fish`)
2. **Line added to your shell config:**
   - **zsh:** `source "~/.config/kiln/shell/kiln.zsh"` added to `~/.zshrc`
   - **bash:** `source "~/.config/kiln/shell/kiln.bash"` added to `~/.bashrc`
   - **fish:** `source "~/.config/kiln/shell/kiln.fish"` added to `~/.config/fish/config.fish`

Click **"Install & Start"** to set up shell integration and begin using Kiln in block mode.

### Skipping Shell Integration

If you prefer to skip the setup, click **"Skip"**. Kiln will launch in terminal mode (using xterm.js) without block parsing. You will see a persistent hint in the header bar that block mode is available.

You can install shell integration later from the command palette (`Cmd+P` > "Install shell integration").

### Subsequent Launches

After the first launch, Kiln checks whether shell integration is already installed. If it is, the welcome screen is skipped and a session is created immediately.

## Block Mode vs Terminal Mode

- **Block mode** (with shell integration): Each command and its output appears as a distinct visual block with styling, collapse controls, exit codes, and duration timers.
- **Terminal mode** (without shell integration): A traditional full-screen terminal view using xterm.js. All features still work, but output is not organized into blocks.

### Clickable Links in Block Output

In block mode, Kiln automatically detects URLs and file paths in command output:

- **URLs** (`https://...`, `http://...`, `ftp://...`, `file://...`) are rendered as clickable links that open in your default browser.
- **File paths** (absolute paths like `/src/main.rs:42:5`, relative paths like `./foo`, `~/config`) are rendered as clickable links that copy the path to your clipboard on click.

Links are styled with an accent-colored underline and do not interfere with text selection.

### Rich Output Previews

In block mode, Kiln can detect structured content in command output and offer a rich preview. When a block's output is recognized as one of the supported formats, a **Preview** button appears in the block header.

Supported formats:

- **JSON** -- syntax-highlighted view with a collapsible tree (expand/collapse objects and arrays)
- **Git diff** -- added lines in green, removed lines in red, hunk headers highlighted
- **CSV / TSV** -- rendered as a table with headers and zebra striping
- **Markdown** -- rendered with headings, code blocks, bold, italic, links, and lists
- **Column-aligned output** (e.g. `docker ps`, `ls -l`) -- parsed into a proper table

Previews are opt-in per block. The default view is always the raw output. Click **Preview** to switch to the rich view, and **Raw** to switch back. Preview state is per-block and does not persist across sessions.

## Reversibility

The shell integration is harmless if Kiln is uninstalled. The `source` line in your shell config silently does nothing if the script file does not exist. To remove it manually, delete the `source` line from your shell config (`.zshrc`, `.bashrc`, or `config.fish`) and remove `~/.config/kiln/shell/`.
