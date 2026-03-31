import { useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from './store'
import { useActiveSessionBlocks, useActiveSessionMode, useActiveSessionName, useActiveSessionError } from './hooks/useActiveSession'
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
import type { KilnConfig, ShellIntegrationStatus } from './store/types'

function Header() {
  const activeSessionId = useStore((s) => s.activeSessionId)
  const renameSession = useStore((s) => s.renameSession)
  const fixShellIntegration = useStore((s) => s.fixShellIntegration)
  const sessionName = useActiveSessionName()
  const sessionMode = useActiveSessionMode()

  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef<HTMLInputElement>(null)

  const isMac = navigator.platform.includes('Mac')

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
              className="bg-surface-raised border border-accent rounded px-1.5 py-0.5 text-sm text-text-primary outline-none font-mono w-40"
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

function MainView() {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const isAutoScrolling = useRef(false)

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
  const sessionError = useActiveSessionError()

  // Detect if a command is currently running
  const isCommandRunning = blocks.length > 0 && blocks[blocks.length - 1].status === 'running'

  // Get cwd from the most recent block for filesystem completions
  const lastCwd = blocks.length > 0 ? blocks[blocks.length - 1].cwd : '~'

  // Autocomplete hook — only active when not running a command
  useCompletions(isCommandRunning ? '' : input, lastCwd)

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = 20 // approximate line height for text-sm monospace
    const maxHeight = lineHeight * 6
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [])

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

  // Auto-scroll when new blocks are added
  const blockCount = blocks.length
  useEffect(() => {
    if (autoScroll && blockCount > 0) {
      requestAnimationFrame(() => {
        isAutoScrolling.current = true
        blockVirtualizer.scrollToIndex(blockCount - 1, { align: 'end' })
        isAutoScrolling.current = false
      })
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
    if (e.key === 'c' && (e.metaKey || e.ctrlKey) && activeSessionId) {
      e.preventDefault()
      invoke('write_stdin', {
        sessionId: activeSessionId,
        data: '\x03',
      })
      return
    }

    // Autocomplete keyboard handling (when completions are visible)
    if (completionsVisible && completions.length > 0) {
      if (e.key === 'Tab') {
        e.preventDefault()
        acceptCompletion()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCompletionIndex((completionIndex + 1) % completions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCompletionIndex((completionIndex - 1 + completions.length) % completions.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        acceptCompletion()
        return
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
              <div className="p-4 text-text-secondary text-sm">Ready.</div>
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

          {/* Jump to bottom button */}
          {!autoScroll && blocks.length > 0 && (
            <button
              onClick={jumpToBottom}
              className="absolute bottom-16 right-4 z-10 bg-accent hover:bg-accent/80 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg transition-colors"
            >
              ↓ Jump to bottom
            </button>
          )}

          <div className="border-t border-border bg-surface p-3 shrink-0 relative">
            {!isCommandRunning && <Autocomplete />}
            <textarea
              ref={inputRef}
              value={isCommandRunning ? '' : input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={isCommandRunning ? 'Input goes to running process...' : 'Type a command...'}
              autoFocus
              rows={1}
              className={`w-full bg-surface-raised border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent font-mono resize-none overflow-hidden ${
                isCommandRunning
                  ? 'text-text-secondary placeholder:text-text-secondary/70'
                  : 'text-text-primary placeholder:text-text-secondary'
              }`}
            />
          </div>
        </>
      )}

      {/* Session Switcher overlay */}
      {switcherOpen && <SessionSwitcher />}
      {paletteOpen && <CommandPalette />}
    </div>
  )
}
