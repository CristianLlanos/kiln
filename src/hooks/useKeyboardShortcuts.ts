import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useStore } from '../store'
import { toggleInteractiveMode } from '../utils/interactive'

/**
 * Global keyboard shortcuts for Kiln.
 *
 * - Cmd+N / Ctrl+N: new window
 * - Cmd+E / Ctrl+E: toggle session switcher (double-press filters to running)
 * - Cmd+Shift+N / Ctrl+Shift+N: create new session
 * - Cmd+W / Ctrl+W: close active session
 */
export function useKeyboardShortcuts() {
  const lastToggleTime = useRef(0)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey

      // Cmd+E / Ctrl+E — toggle session switcher
      if (mod && e.key === 'e' && !e.shiftKey) {
        e.preventDefault()
        const store = useStore.getState()
        const now = Date.now()
        const wasOpen = store.switcherOpen

        if (wasOpen) {
          // If already open, a quick second press means "filter to running"
          const elapsed = now - lastToggleTime.current
          if (elapsed < 500) {
            store.toggleSwitcherRunningOnly()
          } else {
            store.setSwitcherOpen(false)
          }
        } else {
          store.setSwitcherOpen(true)
          lastToggleTime.current = now
        }
        return
      }

      // Cmd+T / Ctrl+T — new session
      if (mod && !e.shiftKey && e.key === 't') {
        e.preventDefault()
        useStore.getState().createNewSession()
        return
      }

      // Cmd+Shift+N / Ctrl+Shift+N — new session (alternative)
      if (mod && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault()
        useStore.getState().createNewSession()
        return
      }

      // Cmd+N / Ctrl+N — new window
      if (mod && !e.shiftKey && e.key === 'n') {
        e.preventDefault()
        invoke('create_window').catch(console.error)
        return
      }

      // Cmd+F / Ctrl+F — toggle search
      if (mod && e.key === 'f' && !e.shiftKey) {
        e.preventDefault()
        const store = useStore.getState()
        store.setSearchOpen(!store.searchOpen)
        return
      }

      // Cmd+W / Ctrl+W — close active session
      if (mod && e.key === 'w' && !e.shiftKey) {
        e.preventDefault()
        const store = useStore.getState()
        if (store.activeSessionId) {
          store.closeSession(store.activeSessionId)
        }
        return
      }

      // Cmd+P / Ctrl+P — toggle command palette
      if (mod && e.key === 'p' && !e.shiftKey) {
        e.preventDefault()
        const store = useStore.getState()
        store.setPaletteOpen(!store.paletteOpen)
        return
      }

      // Ctrl+L — clear session output (standard terminal keybinding)
      if (e.ctrlKey && e.key === 'l' && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        useStore.getState().clearSessionOutput()
        return
      }

      // Cmd+I / Ctrl+I — toggle interactive mode
      if (mod && e.key === 'i' && !e.shiftKey) {
        e.preventDefault()
        const sid = useStore.getState().activeSessionId
        if (sid) toggleInteractiveMode(sid)
        return
      }

      // F2 — rename active session
      if (e.key === 'F2') {
        e.preventDefault()
        useStore.getState().setTriggerRename(true)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
