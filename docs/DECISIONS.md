# Decision Log

Architectural and design decisions for Kiln, with rationale. Reference this before re-evaluating settled decisions.

---

## D1: Tauri v2 over Electron

**Decision:** Use Tauri v2 (Rust backend + webview) instead of Electron.

**Why:** Electron works (Hyper, Tabby prove it) but produces ~200MB binaries and ~150-300MB memory per window. Tauri gives ~10-20MB binaries, native webview, and lower memory. The tradeoff is that the Rust backend is harder for contributors, but the React frontend (where most UI work happens) is standard and accessible.

**Alternatives considered:**
- Electron — proven but heavy, "Electron bloat" perception
- Rust-native (Alacritty/Wezterm style) — best performance but contributor barrier too high for open source
- Kotlin Multiplatform — no PTY libraries, no terminal rendering libraries, would rebuild solved problems from scratch
- Swift/SwiftUI — not cross-platform

## D2: Command runner, not terminal emulator

**Decision:** Kiln is a UI for running commands, not a VT100 terminal emulator. Output renders as React components (styled DOM text), not a character grid.

**Why:** A terminal emulator renders everything as a fixed-size character grid. This makes readability, search, copy, and rich previews all harder than they need to be. By rendering output as React components, we get native text selection, DOM search, flexible typography, and the ability to add rich previews (JSON trees, diff highlighting, tables) per block.

**Tradeoff:** We still need xterm.js for interactive/TUI programs (vim, htop). This creates a dual-mode architecture that's more complex than a pure terminal or pure command runner.

## D3: Persistent PTY with shell integration (OSC 133)

**Decision:** Use a persistent PTY shell session with OSC 133 shell integration markers for block detection.

**Why:** We evaluated three approaches:
- **Isolated execution** (`/bin/zsh -c "command"` per command) — clean stdout/stderr separation but `cd`, env vars, aliases don't persist between commands. Breaks the shell mental model.
- **Persistent PTY with markers** — full shell experience, state persists, block detection via OSC 133. Stdout/stderr merge (PTY limitation) but exit code covers 90% of the value.
- **Hybrid** (persistent PTY + stderr capture via redirect) — fragile, breaks pipes and redirects.

Persistent PTY is proven (Warp, iTerm2, VS Code all use shell integration). The marker approach is well-understood.

## D4: Dual-mode UI (normal + interactive)

**Decision:** Normal mode renders React blocks. When a program activates alt screen (`ESC[?1049h`), switch to fullscreen xterm.js. Return to normal mode on alt screen exit.

**Why:** The user uses vim daily. TUI apps need a real terminal. Alt screen detection is universal — every TUI program uses it, so no command allowlist is needed. The transition should feel seamless.

## D5: Block-based from day 1

**Decision:** Architect for blocks from the start, not as a later addition.

**Why:** Retrofitting a block model onto a stream-based renderer would require a painful rewrite of the entire frontend. Claude Code Desktop proves that block-based (chat-style) works well for this kind of interface. Each command+output is a discrete visual unit.

## D6: No tab bar — JetBrains-style session switcher

**Decision:** No persistent tab bar. Sessions switch via `Cmd+E` popup with fuzzy filtering.

**Why:** Tab bars consume vertical space and don't scale past ~8 tabs. The JetBrains `Ctrl+E` pattern (fuzzy-filtered popup, keyboard-first, MRU-ordered) is faster and scales to any number of sessions. It also eliminates the need for a sidebar — the switcher IS the navigation.

**How it works:**
- `Cmd+E` opens popup, type to fuzzy filter by name/cwd/command
- Up/Down + Enter to switch, Escape to close
- Double-press filters to sessions with running commands
- Delete closes a session from the list

## D7: No sidebar

**Decision:** No sidebar. Maximum content space.

**Why:** The sidebar was originally for sessions, command history, and bookmarks. The session switcher (`Cmd+E`) handles sessions better. Command history IS the main area (blocks are your history). Bookmarks don't match real terminal workflows — developers scroll, search, re-run, or copy. Three shortcuts cover all navigation: `Cmd+E`, `Cmd+P`, `Cmd+F`.

## D8: No split panes

**Decision:** No split panes. Tabs (sessions) + switcher is the session model.

**Why:** In a block-based chat-like UI, horizontal/vertical splits create competing scroll contexts and break the readability promise. Warp has splits but they feel forced in a block model. This is an opinionated choice — simpler, cleaner, more focused.

## D9: Fixed bottom input (chat-style)

**Decision:** Input area is fixed at the bottom of the viewport, like a chat input.

**Why:** Matches the block-based model — you read output above, type below. Natural for the chat-like mental model. Also makes it easy to attach autocomplete dropdowns above the input.

## D10: Kotlin-inspired color palette

**Decision:** Dark theme based on Kotlin Multiplatform brand colors — `#7F52FF` (purple-blue) as primary accent.

**Why:** User preference. The palette provides a distinctive identity: dark backgrounds (`#0F0F14`), warm purples for accents, clear error/success colors.

## D11: Zsh first, bash/fish in Phase 2

**Decision:** Ship zsh shell integration in Phase 1. Add bash and fish in Phase 2.

**Why:** The user uses zsh. macOS defaults to zsh. Building one integration well and proving the architecture is better than spreading across three shells immediately.

## D12: Auto-scroll with pause on user scroll

**Decision:** Streaming output auto-scrolls. If the user scrolls up, auto-scroll pauses. "Jump to bottom" button appears. Scrolling back to bottom resumes auto-scroll.

**Why:** Same pattern as `tail -f` and Claude Code Desktop. Most natural "watching live output" behavior.

## D13: Auto-collapse long output

**Decision:** Blocks with output exceeding ~50 lines auto-collapse. Shows first few lines + line count badge. Click to expand. Manually collapsible/expandable.

**Why:** Long output (npm install, docker build) hurts readability of the session history. Collapse keeps things scannable while preserving access to full output.

## D14: Stdin routes to active PTY

**Decision:** While a command is running, keyboard input routes directly to the PTY. No special prompt detection.

**Why:** Simplest and most reliable approach. `sudo`, `ssh`, `[y/N]` prompts, `read` in scripts — all just work. Pattern detection (trying to identify `Password:` prompts) is fragile and unnecessary.

## D15: Multiple windows, sessions per window

**Decision:** Support multiple windows. Each window manages its own session pool. Sessions don't move between windows.

**Why:** Developers commonly use multiple windows (one per project/monitor). Tauri v2 supports multi-window natively. Keeping sessions per-window is simple and intuitive. Shared session pools across windows add complexity with little real benefit.

## D16: No bookmarks

**Decision:** No bookmark feature.

**Why:** Bookmarks add UI complexity (star buttons, management panel) for a workflow that doesn't exist in practice. When developers need to reference output, they scroll, search (`Cmd+F`), re-run the command, or copy it. If demand emerges later, it's easy to add — it's not architectural.

## D17: Performance guardrails

**Decision:** Three-layer performance protection:
1. Block buffer (Rust): cap at 50k lines, truncate middle, keep head + tail
2. DOM rendering (React): virtualized, only viewport lines in DOM
3. Stream throttle (Rust): batch output into 16ms frames

**Why:** Output is React DOM nodes. Without limits, `cat huge-file.log` would create millions of DOM elements and crash the browser. Virtualization keeps the DOM small. Throttling prevents flooding the frontend. Buffer cap prevents unbounded memory growth.

## D18: GitHub Releases for distribution

**Decision:** Use GitHub Releases + Tauri GitHub Action for builds and distribution. Auto-updater checks GitHub on launch.

**Why:** Free, reliable, standard for open source. Tauri has first-class support. No infrastructure to maintain.

## D19: Always mix filesystem + history completions

**Decision:** Autocomplete always fetches both filesystem completions (last token as a filename in cwd) and history completions (full input against shell history). Results merge: filesystem first, then history, capped at ~15.

**Why:** The previous approach only triggered filesystem completion when the last token started with `/`, `./`, `../`, or `~/`. This meant `cat README<tab>` got no file suggestions — only history. Real shells complete bare filenames in cwd, and users expect it.

**Alternatives considered:**
- Heuristic split (detect "command + argument" patterns) — fragile, doesn't generalize
- Filesystem-only for second token onward — misses history completions for partial commands

## D20: Arrow keys own completion list when visible

**Decision:** When the autocomplete dropdown is visible, ArrowUp/ArrowDown navigate the completion list exclusively. History navigation (ArrowUp/ArrowDown) only activates when completions are dismissed or empty. The completion list stays open during debounce re-fetch while the user is actively navigating with arrows.

**Why:** Without this, a race condition exists: user presses ArrowDown to select a completion, debounce triggers a re-fetch that briefly empties the list, and the arrow falls through to history navigation. The interaction must be modal — arrows belong to whichever UI element is active.

## D21: Global keyboard capture to input

**Decision:** A document-level `keydown` listener redirects printable keystrokes to the command input textarea when no overlay (switcher, palette, search) is open, no other input element is focused, and the app is not in interactive/fallback mode.

**Why:** After clicking a block, scrolling, or any non-input interaction, focus leaves the textarea. Users expect to just start typing — they shouldn't have to click the input first. This matches VS Code's command palette and Spotlight behavior: typing goes to the obvious place.

**What it does NOT capture:** Cmd/Ctrl shortcuts, arrow keys, Tab, or keys when another input is focused.

## D22: Previews enabled by default with size guard

**Decision:** Rich previews (JSON, diff, CSV, markdown, tables) are shown by default when content type is detected. Per-block "Raw" toggle switches to raw output. Global config `appearance.previews = false` disables previews entirely. Preview detection is skipped when plain text exceeds 100KB.

**Why:** Previews are the point — rendering output better than a terminal. Defaulting to off meant most users never discovered them. The 100KB guard prevents parser crashes on massive output (e.g., `cat huge.json`) without adding complex error handling. Per-block toggle gives fine-grained control; global config gives an escape hatch.

## D23: Ctrl+C visual feedback

**Decision:** When the user sends SIGINT via Ctrl+C, show a brief inline hint (e.g., a flash or "interrupted" label near the input) confirming the signal was sent.

**Why:** When output is stalled or a command produces no visible change after Ctrl+C, the user doesn't know if the signal went through. Visual confirmation prevents repeated Ctrl+C mashing and reduces anxiety.

## D24: Block timestamps

**Decision:** Show relative time ("2m ago") in the block header. Show absolute time on hover.

**Why:** When scrolling through session history, timestamps help orient the user. Relative time is scannable at a glance; absolute time is available on demand for precision.

## D25: Richer empty state

**Decision:** When a session has no blocks, show the current working directory and subtle shortcut hints (Cmd+E, Cmd+P, Cmd+F) instead of just "Ready."

**Why:** "Ready." tells you nothing. The cwd orients you ("am I in the right directory?") and shortcut hints help new users discover features without being intrusive. Once blocks exist, the empty state disappears.

## D26: Cwd indicator above input

**Decision:** Show the current working directory as a small muted line (`text-xs text-text-secondary`) above the input textarea. Always visible while typing, hidden in interactive/fallback mode.

**Why:** The user needs to know where they are before typing a command. Without this, the only cwd info is in the last block's header — easy to miss, and absent entirely in an empty session. Placing it above the input keeps it in the natural eye path. A placeholder-based approach (Option A) disappears while typing, which is exactly when you still need it. A tooltip approach (Option C) hides it behind a hover.

## D27: History position indicator

**Decision:** When navigating command history with ArrowUp/ArrowDown, show a subtle counter (e.g., "2 of 15") near the input area indicating position in the history stack.

**Why:** Without this, the user doesn't know how deep they are in history or how many entries remain. The counter appears only during navigation and disappears when the user types or submits.

## D28: Buffer and replay for interactive mode mount

**Decision:** When the backend emits `mode_switch` to interactive, it starts buffering `pty_stream` data. The frontend signals readiness via a new `interactive_ready(session_id)` command once xterm.js is mounted and listening. The backend then replays the buffer and resumes normal streaming.

**Why:** There's a race condition: the `mode_switch` event triggers React to mount the `InteractiveMode` component, but xterm.js's event listener isn't registered until after the first render (`useEffect`). Any `pty_stream` events emitted in that window are lost — this is why vim's initial screen draw is missing. Buffering eliminates the race without adding artificial delays.

## D29: Detect all alt screen variants

**Decision:** Trigger interactive mode on `ESC[?1049h`, `ESC[?1047h`, and `ESC[?47h`. Scan for all three exit variants (`l` suffix) when leaving interactive mode.

**Why:** The parser only detected `?1049h`, which is the most common alt screen sequence. But some programs use older variants (`?1047h`, `?47h`). Missing these means TUI programs stay in normal mode where the parser strips their cursor movement and screen drawing sequences.

## D30: Configurable force-interactive commands

**Decision:** Add `shell.interactive_commands` config option — a list of command prefixes that force immediate interactive mode before any output arrives. Default: `["vim", "nvim", "vi", "htop", "top", "claude", "ssh", "less", "man", "nano", "emacs"]`.

**Why:** Some programs (notably Claude CLI) don't use any alt screen sequence — they draw their TUI using cursor positioning directly. Without alt screen detection, these programs break in normal mode: the parser strips cursor movement, clearing, and positioning sequences, and input routes to the block input instead of the PTY. A command allowlist is simple, configurable, and handles all edge cases. Heuristic detection (auto-switching on cursor positioning sequences) was rejected as fragile — progress bars and spinners use the same sequences briefly.

**Alternatives considered:**
- Heuristic detection (cursor positioning → auto-switch) — too many false positives from progress bars and CLI spinners
- Alt screen only — doesn't cover programs that don't use alt screen at all

## D31: Input resize handle

**Decision:** Add a small draggable grip at the top edge of the input area, allowing users to expand it beyond the 6-line auto-grow limit.

**Why:** The auto-grow cap at 6 lines covers most commands, but multi-line scripts or complex pipelines need more space. A drag handle gives the user control without permanently consuming screen space.

## D32: Inline rename instead of window.prompt()

**Decision:** Replace the `window.prompt()` call in the "Rename Session" command palette action with an inline rename flow. The palette action should close the palette and activate the existing header rename field (double-click to edit).

**Why:** `window.prompt()` doesn't work reliably in Tauri's webview — it may silently fail or show an unstyled browser dialog. The header already has a double-click rename input (`App.tsx`), so the palette should trigger that same flow rather than maintaining a separate rename mechanism.

## D33: Ctrl+L clears session output

**Decision:** Bind `Ctrl+L` to clear the active session's output blocks. This is in addition to the existing command palette action ("Clear Session Output").

**Why:** `Ctrl+L` is the universal terminal keybinding for clearing the screen. Every developer expects it to work. Not having it is a guaranteed friction point.

## D34: Circular arrow navigation in overlays

**Decision:** ArrowDown at the bottom of the list wraps to the top. ArrowUp at the top wraps to the bottom. Applies to both the command palette and session switcher.

**Why:** Clamping at boundaries (the current `Math.min`/`Math.max` behavior) forces users to reverse direction to reach items at the other end of the list. Circular navigation is standard in dropdown menus, command palettes (VS Code, JetBrains), and autocomplete. It's a small change with outsized impact on keyboard flow.
