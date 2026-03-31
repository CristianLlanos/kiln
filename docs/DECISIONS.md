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
