import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useStore } from '../store'
import { fuzzyScore } from '../utils/fuzzyMatch'
import { isMac } from '../utils/session'
import { toggleInteractiveMode } from '../utils/interactive'
import type { KilnConfig } from '../store/types'

interface PaletteAction {
  id: string
  name: string
  category: string
  shortcut?: string
  handler: () => void | Promise<void>
}

const MOD_KEY = isMac ? '⌘' : 'Ctrl+'

function useActions(): PaletteAction[] {
  const mod = MOD_KEY

  return useMemo(() => {
    function action(
      id: string,
      category: string,
      name: string,
      handler: () => void | Promise<void>,
      shortcut?: string,
    ): PaletteAction {
      return { id, name, category, shortcut, handler }
    }

    return [
      // Session
      action('session:new', 'Session', 'New Session', () => {
        useStore.getState().createNewSession()
      }, `${mod}T`),

      action('session:close', 'Session', 'Close Session', () => {
        const store = useStore.getState()
        if (store.activeSessionId) {
          store.closeSession(store.activeSessionId)
        }
      }, `${mod}W`),

      action('session:rename', 'Session', 'Rename Session', () => {
        useStore.getState().setTriggerRename(true)
      }, 'F2'),

      action('session:switch', 'Session', 'Switch Session', () => {
        useStore.getState().setSwitcherOpen(true)
      }, `${mod}E`),

      // Window
      action('window:new', 'Window', 'New Window', () => {
        invoke('create_window').catch(console.error)
      }, `${mod}N`),

      // View
      action('view:search', 'View', 'Toggle Search', () => {
        // Dispatch Cmd+F programmatically so the search handler picks it up
        const event = new KeyboardEvent('keydown', {
          key: 'f',
          code: 'KeyF',
          metaKey: isMac,
          ctrlKey: !isMac,
          bubbles: true,
        })
        window.dispatchEvent(event)
      }, `${mod}F`),

      action('view:clear', 'View', 'Clear Session Output', () => {
        useStore.getState().clearSessionOutput()
      }, 'Ctrl+L'),

      // View
      action('view:toggle-interactive', 'View', 'Toggle Interactive Mode', () => {
        const sid = useStore.getState().activeSessionId
        if (sid) toggleInteractiveMode(sid)
      }, `${mod}I`),

      // Settings
      action('settings:open-config', 'Settings', 'Open Config File', () => {
        invoke('open_config').catch(console.error)
      }),

      action('settings:reload-config', 'Settings', 'Reload Config', async () => {
        try {
          const cfg = await invoke<KilnConfig>('get_config')
          useStore.getState().setConfig(cfg)
        } catch (e) {
          console.error('Failed to reload config:', e)
        }
      }),

      // Shell Integration
      action('shell:install', 'Shell Integration', 'Install / Fix Shell Integration', async () => {
        const store = useStore.getState()
        if (store.activeSessionId) {
          await store.fixShellIntegration(store.activeSessionId)
        }
      }),
    ]
  }, [mod])
}

export function CommandPalette() {
  const [filter, setFilter] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const setPaletteOpen = useStore((s) => s.setPaletteOpen)
  const actions = useActions()

  const resetAndClose = useCallback(() => {
    setFilter('')
    setPaletteOpen(false)
  }, [setPaletteOpen])

  const filteredActions = useMemo(() => {
    if (!filter.trim()) return actions
    const query = filter.trim()
    return actions
      .map((a) => ({ action: a, score: fuzzyScore(`${a.category} ${a.name}`, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.action)
  }, [actions, filter])

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [filter])

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

  const executeAction = useCallback((action: PaletteAction) => {
    resetAndClose()
    // Execute after closing so the palette is gone
    Promise.resolve(action.handler()).catch(console.error)
  }, [resetAndClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        resetAndClose()
        break

      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % filteredActions.length)
        break

      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + filteredActions.length) % filteredActions.length)
        break

      case 'Enter':
        e.preventDefault()
        if (filteredActions[selectedIndex]) {
          executeAction(filteredActions[selectedIndex])
        }
        break
    }
  }, [filteredActions, selectedIndex, resetAndClose, executeAction])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={resetAndClose}
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
              Command Palette
            </span>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Type a command..."
            className="w-full bg-surface border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-accent font-mono"
          />
        </div>

        {/* Action list */}
        <div ref={listRef} className="max-h-[40vh] overflow-y-auto py-1">
          {filteredActions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-text-secondary">
              No matching commands
            </div>
          ) : (
            filteredActions.map((action, index) => {
              const isSelected = index === selectedIndex

              return (
                <div
                  key={action.id}
                  className={`px-4 py-2 cursor-pointer transition-colors flex items-center justify-between ${
                    isSelected ? 'bg-accent/15' : 'hover:bg-surface'
                  }`}
                  onClick={() => executeAction(action)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-medium text-text-secondary/60 uppercase tracking-wider shrink-0 w-24 text-right">
                      {action.category}
                    </span>
                    <span className="text-sm text-text-primary truncate">
                      {action.name}
                    </span>
                  </div>
                  {action.shortcut && (
                    <span className="text-xs text-text-secondary/50 shrink-0 ml-3 font-mono">
                      {action.shortcut}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-text-secondary/60">
          <span>↑↓ navigate</span>
          <span>↵ execute</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
