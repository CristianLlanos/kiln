import { invoke } from '@tauri-apps/api/core'
import { useStore } from '../store'

export function toggleInteractiveMode(sessionId: string) {
  const store = useStore.getState()
  const mode = store.sessions[sessionId]?.mode
  if (mode === 'interactive') {
    invoke('exit_interactive', { sessionId }).catch(console.error)
    store.setSessionMode(sessionId, 'normal')
  } else if (mode === 'normal') {
    invoke('force_interactive', { sessionId }).catch(console.error)
  }
}
