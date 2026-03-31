import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useStore } from '../store'
import type { KilnConfig, SessionMode, StyledSegment } from '../store/types'

interface BlockStartPayload {
  session_id: string
  block_id: string
  command: string
  cwd: string
  timestamp: number
}

interface BlockOutputPayload {
  session_id: string
  block_id: string
  segments: StyledSegment[]
}

interface BlockCompletePayload {
  session_id: string
  block_id: string
  exit_code: number
  duration: number
}

interface ModeSwitchPayload {
  session_id: string
  mode: SessionMode
}

interface SessionErrorPayload {
  session_id: string
  error: string
}

export function useTauriEvents() {
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = []

    unlisteners.push(
      listen<BlockStartPayload>('block_start', (event) => {
        const { session_id, block_id, cwd, timestamp } = event.payload
        // Retrieve the pending command from the store
        const pending = useStore.getState().pendingCommands[session_id] || ''
        useStore.getState().addBlock(session_id, {
          id: block_id,
          command: pending,
          cwd,
          timestamp,
          status: 'running',
          segments: [],
          lines: [],
        })
        // Clear pending command
        useStore.getState().setPendingCommand(session_id, '')
      })
    )

    unlisteners.push(
      listen<BlockOutputPayload>('block_output', (event) => {
        const { session_id, block_id, segments } = event.payload
        useStore.getState().appendSegments(session_id, block_id, segments)
      })
    )

    unlisteners.push(
      listen<BlockCompletePayload>('block_complete', (event) => {
        const { session_id, block_id, exit_code, duration } = event.payload
        useStore.getState().completeBlock(session_id, block_id, exit_code, duration)
      })
    )

    unlisteners.push(
      listen<ModeSwitchPayload>('mode_switch', (event) => {
        const { session_id, mode } = event.payload
        useStore.getState().setSessionMode(session_id, mode)
      })
    )

    unlisteners.push(
      listen<SessionErrorPayload>('session_error', (event) => {
        const { session_id, error } = event.payload
        useStore.getState().setSessionError(session_id, error)
      })
    )

    unlisteners.push(
      listen<KilnConfig>('config_changed', (event) => {
        useStore.getState().setConfig(event.payload)
      })
    )

    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()))
    }
  }, [])
}
