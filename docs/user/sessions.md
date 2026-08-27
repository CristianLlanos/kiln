# Sessions

Each Kiln window can have multiple sessions. A session is a persistent shell instance with its own command history, working directory, and environment.

## Creating Sessions

- Press `Cmd+Shift+N` to create a new session in the current window.
- From the session switcher (`Cmd+E`), select "+ New Session" at the bottom.

New sessions are named "Session 1", "Session 2", etc. by default.

## Switching Sessions

Press `Cmd+E` to open the session switcher. Sessions are shown in most-recently-used order.

- Type to fuzzy-filter by session name, working directory, or last command.
- Use arrow keys to navigate and `Enter` to switch.
- Double-press `Cmd+E` to filter to sessions with running commands only.

There is no tab bar. The switcher popup is the primary navigation model, keeping the interface clean and maximizing content space.

## Renaming Sessions

Double-click the session name in the header bar to rename it. Press `Enter` to confirm or `Escape` to cancel.

## Closing Sessions

- Press `Cmd+W` to close the active session.
- In the switcher, press `Delete` or `Backspace` (with an empty filter) to close the selected session.
- If the session has a running command, you will be asked to confirm.
- If you close the last session, a new one is created automatically.

## Session State

Each session maintains:
- A persistent shell (PTY) with full environment
- Command history (blocks)
- Working directory
- Running/idle status

Background sessions continue running commands even when not visible. The session switcher shows a green dot next to sessions with active commands.

## Session Persistence

Session state is automatically saved every 30 seconds and when the app closes. On next launch, your sessions are restored with their command history and output blocks intact.

- Only completed blocks are saved (up to 50 per session by default, configurable via `[persistence] max_blocks_per_session`).
- Commands that were still running when the app closed appear with an error status on restore.
- A fresh shell process is created on launch -- persisted sessions preserve history and output but not live shell state (environment variables, background jobs, etc.).

Persisted state is stored in `~/.config/kiln/state/session_state.msgpack`.

## Error Recovery

If a session's shell process crashes or exits unexpectedly:

- Any running command block is finalized with an error status.
- An inline system message appears at the bottom of the block list showing the error.
- Previous command blocks are preserved -- your history is not lost.
- Two actions are available:
  - **Restart Session** -- closes the errored session and creates a fresh one with the same name.
  - **New Session** -- creates an entirely new session.

### Block Mode Unavailable

If shell integration markers stop being detected, the session falls back to a terminal view. A header notification appears:

> Block mode unavailable -- [Fix]

Clicking **Fix** reinstalls shell integration and restarts the session to restore block mode.

### Application Crash

If the Kiln interface itself crashes, a full-screen error screen appears with a **Restart** button that reloads the application. Running PTY sessions are lost in this case (unavoidable), but you can start fresh immediately.
