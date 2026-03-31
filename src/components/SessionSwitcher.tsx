import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useStore } from '../store'
import type { Session } from '../store/types'
import { hasRunningCommand, getLastBlock, formatTimeAgo, shortenHomePath, isMac } from '../utils/session'
import { fuzzyScore } from '../utils/fuzzyMatch'

export function SessionSwitcher() {
  const [filter, setFilter] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const sessions = useStore((s) => s.sessions)
  const sessionOrder = useStore((s) => s.sessionOrder)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const switchSession = useStore((s) => s.switchSession)
  const closeSession = useStore((s) => s.closeSession)
  const createNewSession = useStore((s) => s.createNewSession)
  const renameSession = useStore((s) => s.renameSession)
  const setSwitcherOpen = useStore((s) => s.setSwitcherOpen)
  const runningOnly = useStore((s) => s.switcherRunningOnly)

  const resetAndClose = useCallback(() => {
    setFilter('')
    setSwitcherOpen(false)
  }, [setSwitcherOpen])

  // Build filtered session list
  const filteredSessions = useMemo(() => {
    let ordered = sessionOrder
      .map((id) => sessions[id])
      .filter((s): s is Session => !!s)

    if (runningOnly) {
      ordered = ordered.filter(hasRunningCommand)
    }

    if (filter.trim()) {
      const query = filter.trim()
      ordered = ordered
        .map((s) => {
          const lastBlock = getLastBlock(s)
          const searchable = [s.name, lastBlock?.cwd ?? '', lastBlock?.command ?? ''].join(' ')
          return { session: s, score: fuzzyScore(searchable, query) }
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.session)
    }

    return ordered
  }, [sessions, sessionOrder, filter, runningOnly])

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [filter, runningOnly])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleClose = useCallback(() => {
    resetAndClose()
  }, [resetAndClose])

  const handleSelect = useCallback((id: string) => {
    switchSession(id)
    setFilter('')
  }, [switchSession])

  const handleNewSession = useCallback(() => {
    createNewSession()
    resetAndClose()
  }, [createNewSession, resetAndClose])

  const startRename = useCallback((session: Session) => {
    setRenamingId(session.id)
    setRenameValue(session.name)
  }, [])

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameSession(renamingId, renameValue.trim())
    }
    setRenamingId(null)
    // Refocus the filter input
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [renamingId, renameValue, renameSession])

  const cancelRename = useCallback(() => {
    setRenamingId(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId) {
      renameRef.current?.focus()
      renameRef.current?.select()
    }
  }, [renamingId])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const totalItems = filteredSessions.length + 1 // +1 for "New Session"

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        handleClose()
        break

      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % totalItems)
        break

      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + totalItems) % totalItems)
        break

      case 'Enter':
        e.preventDefault()
        if (selectedIndex < filteredSessions.length) {
          handleSelect(filteredSessions[selectedIndex].id)
        } else {
          handleNewSession()
        }
        break

      case 'Backspace':
      case 'Delete':
        // On empty filter, close selected session
        if (filter === '' && selectedIndex < filteredSessions.length) {
          const target = filteredSessions[selectedIndex]
          const isRunning = hasRunningCommand(target)
          if (isRunning) {
            // Confirm before closing running session
            if (window.confirm(`Session "${target.name}" has a running command. Close it?`)) {
              closeSession(target.id)
            }
          } else {
            closeSession(target.id)
          }
          e.preventDefault()
        }
        break

      case 'F2':
        // Rename selected session
        e.preventDefault()
        if (selectedIndex < filteredSessions.length) {
          startRename(filteredSessions[selectedIndex])
        }
        break

      case 'n':
      case 'N':
        // Cmd+N within the popup creates a new session
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          handleNewSession()
        }
        break
    }
  }, [filteredSessions, selectedIndex, filter, handleClose, handleSelect, handleNewSession, closeSession, startRename])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Popup */}
      <div
        className="relative w-full max-w-md bg-surface-raised border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-2 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Recent Sessions
            </span>
            {runningOnly && (
              <span className="text-xs text-accent font-medium">Running only</span>
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'F2' && selectedIndex < filteredSessions.length) {
                e.preventDefault()
                e.stopPropagation()
                startRename(filteredSessions[selectedIndex])
              }
            }}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Filter sessions..."
            className="w-full bg-surface border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-accent font-mono"
          />
        </div>

        {/* Session list */}
        <div ref={listRef} className="max-h-[40vh] overflow-y-auto py-1">
          {filteredSessions.map((session, index) => {
            const lastBlock = getLastBlock(session)
            const isRunning = hasRunningCommand(session)
            const isActive = session.id === activeSessionId
            const isSelected = index === selectedIndex

            return (
              <div
                key={session.id}
                className={`px-4 py-2.5 cursor-pointer transition-colors ${
                  isSelected ? 'bg-accent/15' : 'hover:bg-surface'
                }`}
                onClick={() => handleSelect(session.id)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Status dot */}
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isRunning ? 'bg-success' : 'bg-text-secondary/40'
                      }`}
                    />
                    {/* Session name */}
                    {renamingId === session.id ? (
                      <input
                        ref={renameRef}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') commitRename()
                          if (e.key === 'Escape') cancelRename()
                        }}
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        className="text-sm font-medium bg-surface border border-accent rounded px-1.5 py-0.5 text-text-primary outline-none font-mono w-40"
                      />
                    ) : (
                      <span
                        className={`text-sm font-medium truncate ${
                          isActive ? 'text-accent' : 'text-text-primary'
                        }`}
                        onDoubleClick={() => startRename(session)}
                      >
                        {session.name}
                      </span>
                    )}
                  </div>
                  {/* CWD */}
                  {lastBlock?.cwd && (
                    <span className="text-xs text-text-secondary truncate ml-3 shrink-0 max-w-[45%] text-right">
                      {shortenHomePath(lastBlock.cwd)}
                    </span>
                  )}
                </div>
                {/* Last command + time */}
                {lastBlock && (
                  <div className="flex items-center gap-1.5 mt-1 ml-4 text-xs text-text-secondary">
                    <span className="truncate max-w-[60%]">{lastBlock.command}</span>
                    <span className="shrink-0">
                      {isRunning && lastBlock.status === 'running'
                        ? '-- running'
                        : `-- ${formatTimeAgo(lastBlock.timestamp)}`}
                    </span>
                  </div>
                )}
              </div>
            )
          })}

          {/* New Session option */}
          <div
            className={`px-4 py-2.5 cursor-pointer transition-colors flex items-center gap-2 ${
              selectedIndex === filteredSessions.length ? 'bg-accent/15' : 'hover:bg-surface'
            }`}
            onClick={handleNewSession}
            onMouseEnter={() => setSelectedIndex(filteredSessions.length)}
          >
            <span className="text-accent text-sm font-medium">+</span>
            <span className="text-sm text-text-secondary">New Session</span>
            <span className="ml-auto text-xs text-text-secondary/60">
              {isMac ? '⌘T' : 'Ctrl+T'}
            </span>
          </div>
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-text-secondary/60">
          <span>↑↓ navigate</span>
          <span>↵ switch</span>
          <span>esc close</span>
          <span>F2 rename</span>
          <span>del close session</span>
        </div>
      </div>
    </div>
  )
}
