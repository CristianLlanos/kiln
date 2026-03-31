import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useStore } from '../store'

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

      // Cmd+N / Ctrl+N — new window
      if (mod && !e.shiftKey && e.key === 'n') {
        e.preventDefault()
        invoke('create_window').catch(console.error)
        return
      }

      // Cmd+Shift+N / Ctrl+Shift+N — new session
      if (mod && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        useStore.getState().createNewSession()
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
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
