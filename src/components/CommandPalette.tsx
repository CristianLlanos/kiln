import { useState, useEffect, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useStore } from '../store'
import { isMac } from '../utils/session'
import { toggleInteractiveMode } from '../utils/interactive'
import { applyThemeColors } from '../utils/theme'
import { usePaletteList } from '../hooks/usePaletteList'
import type { KilnConfig, KilnTheme } from '../store/types'

interface PaletteAction {
  id: string
  name: string
  category: string
  shortcut?: string
  keepOpen?: boolean
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
      keepOpen?: boolean,
    ): PaletteAction {
      return { id, name, category, shortcut, keepOpen, handler }
    }

    return [
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

      action('window:new', 'Window', 'New Window', () => {
        invoke('create_window').catch(console.error)
      }, `${mod}N`),

      action('view:search', 'View', 'Toggle Search', () => {
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

      action('view:toggle-interactive', 'View', 'Toggle Interactive Mode', () => {
        const sid = useStore.getState().activeSessionId
        if (sid) toggleInteractiveMode(sid)
      }, `${mod}I`),

      action('view:switch-theme', 'View', 'Switch Theme...', () => {
        useStore.getState().setPaletteMode('themes')
      }, undefined, true),

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
  const paletteMode = useStore((s) => s.paletteMode)
  return paletteMode === 'themes' ? <ThemePicker /> : <CommandList />
}

function CommandList() {
  const setPaletteOpen = useStore((s) => s.setPaletteOpen)
  const actions = useActions()

  const resetAndClose = useCallback(() => {
    setPaletteOpen(false)
  }, [setPaletteOpen])

  const actionKeyFn = useCallback((a: PaletteAction) => `${a.category} ${a.name}`, [])

  const executeAction = useCallback((action: PaletteAction) => {
    if (!action.keepOpen) resetAndClose()
    Promise.resolve(action.handler()).catch(console.error)
  }, [resetAndClose])

  const { filter, setFilter, selectedIndex, setSelectedIndex, inputRef, listRef, filtered, handleKeyDown } =
    usePaletteList({ items: actions, keyFn: actionKeyFn, onSelect: executeAction, onEscape: resetAndClose })

  return (
    <PaletteShell onBackdropClick={resetAndClose} onKeyDown={handleKeyDown}>
      <PaletteHeader title="Command Palette">
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
      </PaletteHeader>

      <div ref={listRef} className="max-h-[40vh] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <PaletteEmpty>No matching commands</PaletteEmpty>
        ) : (
          filtered.map((action, index) => (
            <PaletteRow
              key={action.id}
              selected={index === selectedIndex}
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
            </PaletteRow>
          ))
        )}
      </div>

      <PaletteFooter hints={['↑↓ navigate', '↵ execute', 'esc close']} />
    </PaletteShell>
  )
}

function ThemePicker() {
  const [themeNames, setThemeNames] = useState<string[]>([])

  const setPaletteOpen = useStore((s) => s.setPaletteOpen)
  const setPaletteMode = useStore((s) => s.setPaletteMode)
  const setTheme = useStore((s) => s.setTheme)
  const currentThemeName = useStore((s) => s.config?.appearance.theme ?? 'kiln-dark')

  useEffect(() => {
    invoke<string[]>('list_themes')
      .then(setThemeNames)
      .catch((e) => console.error('Failed to list themes:', e))
  }, [])

  const resetAndClose = useCallback(() => {
    setPaletteOpen(false)
  }, [setPaletteOpen])

  const goBack = useCallback(() => {
    setPaletteMode('commands')
  }, [setPaletteMode])

  const selectTheme = useCallback(async (name: string) => {
    try {
      const theme = await invoke<KilnTheme>('get_theme', { name })
      setTheme(theme)
      applyThemeColors(theme)
      await invoke('set_theme', { name })
      resetAndClose()
    } catch (e) {
      console.error('Failed to apply theme:', e)
    }
  }, [setTheme, resetAndClose])

  const themeKeyFn = useCallback((name: string) => name, [])

  const { filter, setFilter, selectedIndex, setSelectedIndex, inputRef, listRef, filtered, handleKeyDown } =
    usePaletteList({ items: themeNames, keyFn: themeKeyFn, onSelect: selectTheme, onEscape: goBack })

  return (
    <PaletteShell onBackdropClick={resetAndClose} onKeyDown={handleKeyDown}>
      <PaletteHeader
        title="Switch Theme"
        left={
          <button
            onClick={goBack}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            &larr; Back
          </button>
        }
      >
        <input
          ref={inputRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Search themes..."
          className="w-full bg-surface border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-accent font-mono"
        />
      </PaletteHeader>

      <div ref={listRef} className="max-h-[40vh] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <PaletteEmpty>No matching themes</PaletteEmpty>
        ) : (
          filtered.map((name, index) => (
            <PaletteRow
              key={name}
              selected={index === selectedIndex}
              onClick={() => selectTheme(name)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="text-sm text-text-primary truncate">{name}</span>
              {name === currentThemeName && (
                <span className="text-xs text-accent shrink-0 ml-3">current</span>
              )}
            </PaletteRow>
          ))
        )}
      </div>

      <PaletteFooter hints={['↑↓ navigate', '↵ select', 'esc back']} />
    </PaletteShell>
  )
}

// ── Shared palette UI primitives ──────────────────────────────────────────

function PaletteShell({ children, onBackdropClick, onKeyDown }: {
  children: React.ReactNode
  onBackdropClick: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onBackdropClick}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md bg-surface-raised border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  )
}

function PaletteHeader({ title, left, children }: {
  title: string
  left?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="px-4 pt-3 pb-2 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        {left ? (
          <div className="flex items-center gap-2">
            {left}
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{title}</span>
          </div>
        ) : (
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{title}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function PaletteRow({ selected, onClick, onMouseEnter, children }: {
  selected: boolean
  onClick: () => void
  onMouseEnter: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className={`px-4 py-2 cursor-pointer transition-colors flex items-center justify-between ${
        selected ? 'bg-accent/15' : 'hover:bg-surface'
      }`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      {children}
    </div>
  )
}

function PaletteEmpty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3 text-sm text-text-secondary">{children}</div>
}

function PaletteFooter({ hints }: { hints: string[] }) {
  return (
    <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-text-secondary/60">
      {hints.map((h) => <span key={h}>{h}</span>)}
    </div>
  )
}
