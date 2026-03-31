# Getting Started

## First Launch

When you open Kiln for the first time, you will see a welcome screen that explains the shell integration setup.

### Shell Integration

Kiln uses a small shell integration script to parse your command output into structured blocks. This script adds invisible markers to your shell prompt so Kiln can detect where each command starts and ends.

The welcome screen shows you exactly what will happen:

1. **File created:** `~/.config/kiln/shell/kiln.zsh` -- the integration script
2. **Line added to `.zshrc`:** `source "~/.config/kiln/shell/kiln.zsh"`

Click **"Install & Start"** to set up shell integration and begin using Kiln in block mode.

### Skipping Shell Integration

If you prefer to skip the setup, click **"Skip"**. Kiln will launch in terminal mode (using xterm.js) without block parsing. You will see a persistent hint in the header bar that block mode is available.

You can install shell integration later from the command palette (`Cmd+P` > "Install shell integration").

### Subsequent Launches

After the first launch, Kiln checks whether shell integration is already installed. If it is, the welcome screen is skipped and a session is created immediately.

## Block Mode vs Terminal Mode

- **Block mode** (with shell integration): Each command and its output appears as a distinct visual block with styling, collapse controls, exit codes, and duration timers.
- **Terminal mode** (without shell integration): A traditional full-screen terminal view using xterm.js. All features still work, but output is not organized into blocks.

## Reversibility

The shell integration is harmless if Kiln is uninstalled. The `source` line in `.zshrc` silently does nothing if the script file does not exist. To remove it manually, delete the line from `~/.zshrc` and remove `~/.config/kiln/shell/`.
