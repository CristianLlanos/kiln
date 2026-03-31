import { useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from './store'
import { useActiveSessionBlocks, useActiveSessionMode, useActiveSessionName, useActiveSessionCwd, useActiveSessionError } from './hooks/useActiveSession'
import { useTauriEvents } from './hooks/useTauriEvents'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useCompletions } from './hooks/useCompletions'
import { InteractiveMode } from './components/InteractiveMode'
import { BlockComponent } from './components/BlockComponent'
import { Autocomplete } from './components/Autocomplete'
import { SessionSwitcher } from './components/SessionSwitcher'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SystemMessage } from './components/SystemMessage'
import { Search } from './components/Search'
import { CommandPalette } from './components/CommandPalette'
import type { CompletionItem, KilnConfig, ShellIntegrationStatus } from './store/types'
import { shortenHomePath, longestCommonPrefix, isMac, getTokenAtCursor } from './utils/session'

function Header() {
  const activeSessionId = useStore((s) => s.activeSessionId)
  const renameSession = useStore((s) => s.renameSession)
  const fixShellIntegration = useStore((s) => s.fixShellIntegration)
  const triggerRename = useStore((s) => s.triggerRename)
  const setTriggerRename = useStore((s) => s.setTriggerRename)
  const sessionName = useActiveSessionName()
  const sessionMode = useActiveSessionMode()

  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef<HTMLInputElement>(null)

  const startEditing = useCallback(() => {
    setEditValue(sessionName)
    setEditing(true)
  }, [sessionName])

  const commitEdit = useCallback(() => {
    setEditing(false)
    if (activeSessionId && editValue.trim()) {
      renameSession(activeSessionId, editValue.trim())
    }
  }, [activeSessionId, editValue, renameSession])

  // Watch for rename trigger from command palette
  useEffect(() => {
    if (triggerRename) {
      setTriggerRename(false)
      startEditing()
    }
  }, [triggerRename, setTriggerRename, startEditing])

  useEffect(() => {
    if (editing) {
      editRef.current?.focus()
      editRef.current?.select()
    }
  }, [editing])

  return (
    <header className="flex items-center h-10 px-4 border-b border-border bg-surface text-text-secondary text-sm shrink-0 select-none">
      <span className="font-semibold text-text-primary">Kiln</span>

      {activeSessionId && (
        <>
          <span className="mx-3 text-border">|</span>

          {editing ? (
            <input
              ref={editRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              size={Math.max(10, editValue.length + 1)}
              className="bg-surface-raised border border-accent rounded px-1.5 py-0.5 text-sm text-text-primary outline-none font-mono"
            />
          ) : (
            <span
              className="text-text-primary cursor-default"
              onDoubleClick={startEditing}
              title="Double-click to rename"
            >
              {sessionName}
            </span>
          )}
        </>
      )}

      {sessionMode === 'fallback' && (
        <span className="ml-3 text-xs text-yellow-400">
          Block mode unavailable
          <button
            className="ml-1 text-accent hover:text-accent/80 underline cursor-pointer"
            onClick={() => activeSessionId && fixShellIntegration(activeSessionId)}
          >
            Fix
          </button>
        </span>
      )}
      {sessionMode === 'interactive' && (
        <span className="ml-3 text-xs text-accent">Interactive mode</span>
      )}

      <span className="ml-auto text-xs text-text-secondary/50">
        {isMac ? '⌘E' : 'Ctrl+E'}
      </span>
    </header>
  )
}

function sanitizeFontFamily(raw: string): string {
  return raw.replace(/[;"'{}\\<>]/g, '')
}

/** Apply appearance config as CSS custom properties on #root */
function applyAppearanceConfig(config: KilnConfig) {
  const root = document.getElementById('root')
  if (!root) return
  const safeFontFamily = sanitizeFontFamily(config.appearance.font_family)
  root.style.setProperty('--config-font-family', `"${safeFontFamily}", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`)
  root.style.setProperty('--config-font-size', `${config.appearance.font_size}px`)
}

export default function App() {
  const shellState = useStore((s) => s.shellState)
  const setShellState = useStore((s) => s.setShellState)
  const setConfig = useStore((s) => s.setConfig)
  const config = useStore((s) => s.config)
  const createNewSession = useStore((s) => s.createNewSession)

  useTauriEvents()
  useKeyboardShortcuts()

  // Load config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const cfg = await invoke<KilnConfig>('get_config')
        setConfig(cfg)
      } catch (e) {
        console.error('Failed to load config:', e)
      }
    }
    loadConfig()
  }, [setConfig])

  // Apply appearance whenever config changes (initial load + hot-reload)
  useEffect(() => {
    if (config) {
      applyAppearanceConfig(config)
    }
  }, [config])

  // Check shell integration on mount; skip welcome if already installed
  useEffect(() => {
    async function checkIntegration() {
      try {
        const status = await invoke<ShellIntegrationStatus>('check_shell_integration')
        const fullyInstalled = status.installed && status.in_rc
        if (fullyInstalled) {
          setShellState('installed')
          await createNewSession()
        } else {
          setShellState('pending')
        }
      } catch (e) {
        console.error('Failed to check shell integration:', e)
        setShellState('pending')
      }
    }
    checkIntegration()
  }, [setShellState, createNewSession])

  if (shellState === 'checking') {
    return <div className="flex flex-col h-full bg-bg" />
  }

  if (shellState === 'pending') {
    return <WelcomeScreen />
  }

  return <MainView />
}

/**
 * Fill the longest common prefix of completions into the input.
 * Returns true if the input was modified.
 */
function fillLongestPrefix(
  input: string,
  el: HTMLTextAreaElement | null,
  texts: string[],
  setInput: (s: string) => void,
  resizeTextarea: () => void,
): boolean {
  const lcp = longestCommonPrefix(texts)
  const cursorPos = el ? (el.selectionStart ?? input.length) : input.length
  const { token, tokenStart } = getTokenAtCursor(input, cursorPos)

  if (lcp.length > token.length) {
    const textAfter = input.substring(cursorPos)
    const newText = input.substring(0, tokenStart) + lcp + textAfter
    setInput(newText)
    requestAnimationFrame(() => {
      const newPos = tokenStart + lcp.length
      el?.setSelectionRange(newPos, newPos)
    })
    requestAnimationFrame(resizeTextarea)
    return true
  }
  return false
}

function MainView() {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const isAutoScrolling = useRef(false)
  const [ctrlCFlash, setCtrlCFlash] = useState(false)
  const [inputManualHeight, setInputManualHeight] = useState<number | null>(null)
  const resizingRef = useRef(false)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(0)

  const activeSessionId = useStore((s) => s.activeSessionId)
  const setPendingCommand = useStore((s) => s.setPendingCommand)
  const pushHistory = useStore((s) => s.pushHistory)
  const navigateHistory = useStore((s) => s.navigateHistory)
  const switcherOpen = useStore((s) => s.switcherOpen)
  const paletteOpen = useStore((s) => s.paletteOpen)
  const searchOpen = useStore((s) => s.searchOpen)

  const completions = useStore((s) => s.completions)
  const completionsVisible = useStore((s) => s.completionsVisible)
  const completionIndex = useStore((s) => s.completionIndex)
  const setCompletionIndex = useStore((s) => s.setCompletionIndex)
  const dismissCompletions = useStore((s) => s.dismissCompletions)

  const blocks = useActiveSessionBlocks()
  const sessionMode = useActiveSessionMode()
  const sessionCwd = useActiveSessionCwd()
  const sessionError = useActiveSessionError()

  // History navigation state for position indicator
  const historyIndex = useStore((s) => {
    const id = s.activeSessionId
    return id ? (s.sessions[id]?.historyIndex ?? -1) : -1
  })
  const historyLength = useStore((s) => {
    const id = s.activeSessionId
    return id ? (s.sessions[id]?.commandHistory.length ?? 0) : 0
  })

  const isCommandRunning = blocks.length > 0 && blocks[blocks.length - 1].status === 'running'

  const lastCwd = sessionCwd

  // Autocomplete hook — only active when not running a command
  useCompletions(isCommandRunning ? '' : input, lastCwd)

  // Auto-resize textarea (respects manual height from drag handle)
  const resizeTextarea = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    if (inputManualHeight !== null) {
      el.style.height = `${inputManualHeight}px`
      el.style.overflowY = 'auto'
      return
    }
    el.style.height = 'auto'
    const lineHeight = 20 // approximate line height for text-sm monospace
    const maxHeight = lineHeight * 6
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [inputManualHeight])

  // Apply manual height when it changes from drag handle
  useEffect(() => {
    resizeTextarea()
  }, [resizeTextarea])

  // Block list virtualizer
  const blockVirtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80, // rough estimate; measured dynamically
    overscan: 3,
    measureElement: (el) => {
      // Dynamic measurement of block heights
      return el.getBoundingClientRect().height
    },
  })

  // Auto-scroll: 'start' when a new block appears, 'end' to follow streaming output
  const blockCount = blocks.length
  const prevBlockCount = useRef(blockCount)
  useEffect(() => {
    if (autoScroll && blockCount > 0) {
      const isNewBlock = blockCount > prevBlockCount.current
      prevBlockCount.current = blockCount
      requestAnimationFrame(() => {
        isAutoScrolling.current = true
        blockVirtualizer.scrollToIndex(blockCount - 1, { align: isNewBlock ? 'start' : 'end' })
        isAutoScrolling.current = false
      })
    } else {
      prevBlockCount.current = blockCount
    }
  }, [blockCount, autoScroll, blockVirtualizer])

  // Detect user scrolling away from bottom to pause auto-scroll
  const handleScroll = useCallback(() => {
    if (isAutoScrolling.current) return
    const el = scrollRef.current
    if (!el) return

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }, [])

  const jumpToBottom = useCallback(() => {
    setAutoScroll(true)
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  // Accept a completion at the given index, inserting at cursor position
  const acceptCompletion = useCallback((index?: number) => {
    const idx = index ?? completionIndex
    const item = completions[idx]
    if (!item) return

    const el = inputRef.current
    if (!el) {
      setInput(item.text)
      dismissCompletions()
      return
    }

    if (item.kind === 'history') {
      // History completions replace the entire input
      setInput(item.text)
    } else {
      // Filesystem completions: replace the last path-like token
      const cursorPos = el.selectionStart ?? input.length
      const textBefore = input.substring(0, cursorPos)
      const textAfter = input.substring(cursorPos)

      // Find the start of the last token before cursor
      const lastSpace = textBefore.lastIndexOf(' ')
      const tokenStart = lastSpace + 1
      const newText = textBefore.substring(0, tokenStart) + item.text + textAfter
      setInput(newText)

      // Set cursor position after the inserted text
      requestAnimationFrame(() => {
        const newCursorPos = tokenStart + item.text.length
        el.setSelectionRange(newCursorPos, newCursorPos)
      })
    }

    dismissCompletions()
    requestAnimationFrame(resizeTextarea)
  }, [completions, completionIndex, input, dismissCompletions, resizeTextarea])

  // Listen for click-based completion acceptance
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      acceptCompletion(detail.index)
    }
    window.addEventListener('kiln:accept-completion', handler)
    return () => window.removeEventListener('kiln:accept-completion', handler)
  }, [acceptCompletion])

  const handleSubmit = async () => {
    if (!input.trim() || !activeSessionId) return

    const command = input.trim()
    // Store the command so block_start can pick it up
    setPendingCommand(activeSessionId, command)
    pushHistory(activeSessionId, command)

    dismissCompletions()
    await invoke('execute_command', {
      sessionId: activeSessionId,
      command: input,
    })
    setInput('')
    setAutoScroll(true)
    // Reset textarea height after clearing
    requestAnimationFrame(resizeTextarea)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'c' && e.ctrlKey && !e.metaKey && activeSessionId && isCommandRunning) {
      e.preventDefault()
      invoke('write_stdin', {
        sessionId: activeSessionId,
        data: '\x03',
      })
      // Visual feedback
      setCtrlCFlash(true)
      setTimeout(() => setCtrlCFlash(false), 1000)
      return
    }

    // Tab completion — works whether or not dropdown is visible
    if (e.key === 'Tab' && !isCommandRunning && input.trim()) {
      e.preventDefault()

      if (completionsVisible && completions.length > 0) {
        // If current token exactly matches a completion, nothing to complete
        const { token: currentToken } = getTokenAtCursor(input, inputRef.current?.selectionStart ?? input.length)
        if (completions.find((c) => c.text === currentToken)) {
          dismissCompletions()
          return
        }

        if (completions.length === 1) {
          acceptCompletion()
        } else {
          useStore.getState().setCompletionsArrowActive(true)
          const filled = fillLongestPrefix(input, inputRef.current, completions.map((c) => c.text), setInput, resizeTextarea)
          if (!filled) {
            setCompletionIndex((completionIndex + 1) % completions.length)
          }
        }
      } else {
        // Completions not visible — fetch immediately and fill common prefix
        const lastToken = input.split(/\s+/).pop() ?? ''
        if (lastToken) {
          Promise.all([
            invoke<CompletionItem[]>('get_completions', { partial: lastToken, cwd: lastCwd }).catch(() => []),
            invoke<CompletionItem[]>('get_history_completions', { partial: input }).catch(() => []),
          ]).then(([fsResults, histResults]) => {
            const all: CompletionItem[] = [...fsResults]
            const seen = new Set(all.map((r) => r.text))
            for (const item of histResults) {
              if (!seen.has(item.text) && item.text !== input) {
                all.push(item)
              }
            }
            if (all.length === 0) return
            if (all.find((c) => c.text === lastToken)) return

            if (all.length === 1) {
              useStore.getState().setCompletions(all)
              requestAnimationFrame(() => acceptCompletion())
            } else {
              useStore.getState().setCompletions(all)
              useStore.getState().setCompletionsArrowActive(true)
              fillLongestPrefix(input, inputRef.current, all.map((c) => c.text), setInput, resizeTextarea)
            }
          })
        }
      }
      return
    }

    // Autocomplete keyboard handling (when completions are visible)
    if (completionsVisible && completions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        useStore.getState().setCompletionsArrowActive(true)
        setCompletionIndex((completionIndex + 1) % completions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        useStore.getState().setCompletionsArrowActive(true)
        setCompletionIndex((completionIndex - 1 + completions.length) % completions.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        if (useStore.getState().completionsArrowActive) {
          // User actively navigated completions — accept selection
          e.preventDefault()
          acceptCompletion()
          return
        }
        // User hasn't interacted with dropdown — dismiss and submit command
        dismissCompletions()
        // Fall through to normal Enter handling below
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        dismissCompletions()
        return
      }
    }

    // When a command is running, send keystrokes to PTY
    if (isCommandRunning && activeSessionId) {
      // Allow Cmd/Ctrl combos to pass through (copy, paste, etc.)
      if (e.metaKey || e.ctrlKey) return

      e.preventDefault()
      if (e.key === 'Enter') {
        invoke('write_stdin', { sessionId: activeSessionId, data: '\n' })
      } else if (e.key === 'Backspace') {
        invoke('write_stdin', { sessionId: activeSessionId, data: '\x7f' })
      } else if (e.key === 'Tab') {
        invoke('write_stdin', { sessionId: activeSessionId, data: '\t' })
      } else if (e.key === 'Escape') {
        invoke('write_stdin', { sessionId: activeSessionId, data: '\x1b' })
      } else if (e.key.length === 1) {
        invoke('write_stdin', { sessionId: activeSessionId, data: e.key })
      }
      return
    }

    // Enter submits (without shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
      return
    }

    // History navigation with up/down arrows
    if (e.key === 'ArrowUp' && activeSessionId) {
      // Only navigate history when cursor is on the first line
      const el = inputRef.current
      if (el) {
        const textBeforeCursor = el.value.substring(0, el.selectionStart ?? 0)
        if (textBeforeCursor.includes('\n')) return // cursor not on first line
      }
      e.preventDefault()
      const result = navigateHistory(activeSessionId, 'up', input)
      if (result !== null) {
        setInput(result)
        requestAnimationFrame(resizeTextarea)
      }
      return
    }

    if (e.key === 'ArrowDown' && activeSessionId) {
      // Only navigate history when cursor is on the last line
      const el = inputRef.current
      if (el) {
        const textAfterCursor = el.value.substring(el.selectionEnd ?? el.value.length)
        if (textAfterCursor.includes('\n')) return // cursor not on last line
      }
      e.preventDefault()
      const result = navigateHistory(activeSessionId, 'down', input)
      if (result !== null) {
        setInput(result)
        requestAnimationFrame(resizeTextarea)
      }
      return
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    resizeTextarea()
  }

  // Global keyboard capture — typing anywhere focuses the input
  useEffect(() => {
    function handleGlobalKeydown(e: KeyboardEvent) {
      // Skip if any overlay is open
      const store = useStore.getState()
      if (store.switcherOpen || store.paletteOpen || store.searchOpen) return
      // Skip if in interactive/fallback mode
      const sid = store.activeSessionId
      if (sid) {
        const mode = store.sessions[sid]?.mode
        if (mode === 'interactive' || mode === 'fallback') return
      }
      // Skip if another input/textarea is focused
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active !== inputRef.current) return
      // Skip modifier combos (except shift for uppercase), arrow keys, Tab, etc.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Escape', 'Enter'].includes(e.key)) return
      // Only capture printable keys
      if (e.key.length !== 1) return

      // Focus and let the event propagate naturally
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', handleGlobalKeydown)
    return () => window.removeEventListener('keydown', handleGlobalKeydown)
  }, [])

  // Input resize handle
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    resizingRef.current = true
    resizeStartY.current = e.clientY
    resizeStartHeight.current = inputRef.current?.offsetHeight ?? 40

    function onMove(pe: PointerEvent) {
      if (!resizingRef.current) return
      const delta = resizeStartY.current - pe.clientY
      const maxH = window.innerHeight * 0.5
      const newHeight = Math.max(40, Math.min(resizeStartHeight.current + delta, maxH))
      setInputManualHeight(newHeight)
    }

    function onEnd() {
      resizingRef.current = false
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onEnd)
      document.removeEventListener('pointercancel', onEnd)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onEnd)
    document.addEventListener('pointercancel', onEnd)
  }, [])

  const displayCwd = shortenHomePath(sessionCwd)

  const isTerminalMode = sessionMode === 'interactive' || sessionMode === 'fallback'

  return (
    <div className="flex flex-col h-full">
      <Header />

      {/* Search bar — between header and content */}
      {searchOpen && !isTerminalMode && <Search />}

      {isTerminalMode && activeSessionId ? (
        /* Interactive / Fallback: fullscreen xterm.js */
        <div className="flex-1 overflow-hidden">
          <InteractiveMode sessionId={activeSessionId} />
        </div>
      ) : (
        /* Normal: virtualized block list + input */
        <>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto relative"
            onScroll={handleScroll}
          >
            {blocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-4 select-none">
                <span className="text-lg font-mono">{displayCwd}</span>
                <div className="flex gap-4 text-sm text-text-secondary/50">
                  <span>{isMac ? '⌘E' : 'Ctrl+E'} sessions</span>
                  <span>{isMac ? '⌘P' : 'Ctrl+P'} commands</span>
                  <span>{isMac ? '⌘F' : 'Ctrl+F'} search</span>
                </div>
              </div>
            ) : (
              <div
                style={{
                  height: blockVirtualizer.getTotalSize(),
                  position: 'relative',
                  width: '100%',
                }}
              >
                {blockVirtualizer.getVirtualItems().map((virtualRow) => (
                  <div
                    key={blocks[virtualRow.index].id}
                    ref={blockVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <BlockComponent block={blocks[virtualRow.index]} />
                  </div>
                ))}
              </div>
            )}

            {/* Session error message */}
            {sessionError && activeSessionId && (
              <SystemMessage sessionId={activeSessionId} error={sessionError} />
            )}
          </div>

          {/* Jump to bottom button — hidden when autocomplete is visible to avoid overlap */}
          {!autoScroll && blocks.length > 0 && !completionsVisible && (
            <button
              onClick={jumpToBottom}
              className="absolute bottom-24 right-4 z-10 bg-accent hover:bg-accent/80 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg transition-colors"
            >
              ↓ Jump to bottom
            </button>
          )}

          <div className="border-t border-border bg-surface shrink-0 relative">
            {/* Resize handle */}
            <div
              className="h-3 cursor-ns-resize flex items-center justify-center hover:bg-border/30 transition-colors touch-none"
              onPointerDown={handleResizeStart}
            >
              <div className="w-8 h-0.5 rounded-full bg-border/50" />
            </div>

            <div className="px-3 pb-2 pt-1 relative">
              {!isCommandRunning && <Autocomplete />}

              <div className={`flex items-start bg-surface-raised border border-border rounded focus-within:border-accent overflow-hidden ${
                isCommandRunning ? '' : ''
              }`}>
                <span className="shrink-0 pl-3 py-2 text-sm font-mono text-accent select-none">❯</span>
                <textarea
                  ref={inputRef}
                  value={isCommandRunning ? '' : input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={isCommandRunning ? 'Input goes to running process...' : 'Type a command...'}
                  autoFocus
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  rows={1}
                  className={`w-full bg-transparent px-2 py-2 text-sm outline-none font-mono resize-none overflow-hidden ${
                    isCommandRunning
                      ? 'text-text-secondary placeholder:text-text-secondary/70'
                      : 'text-text-primary placeholder:text-text-secondary'
                  }`}
                />
              </div>

              {/* Cwd indicator + history position + Ctrl+C badge */}
              <div className="flex items-center justify-between mt-1 min-h-[16px]">
                <span className="text-xs text-text-secondary/60 font-mono truncate">
                  {displayCwd}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {historyIndex >= 0 && historyLength > 0 && (
                    <span className="text-xs text-text-secondary/50">
                      {historyLength - historyIndex} of {historyLength}
                    </span>
                  )}
                  {ctrlCFlash && (
                    <span className="text-xs text-yellow-400 animate-pulse">^C</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Session Switcher overlay */}
      {switcherOpen && <SessionSwitcher />}
      {paletteOpen && <CommandPalette />}
    </div>
  )
}
