import { useStore } from '../store'
import type { Block, SessionMode } from '../store/types'

// Stable empty array — avoids creating a new [] on every selector call,
// which would cause Zustand's Object.is check to fail and trigger re-renders.
const EMPTY_BLOCKS: Block[] = []

export function useActiveSessionBlocks(): Block[] {
  return useStore((s) =>
    s.activeSessionId ? (s.sessions[s.activeSessionId]?.blocks ?? EMPTY_BLOCKS) : EMPTY_BLOCKS
  )
}

export function useActiveSessionMode(): SessionMode {
  return useStore((s) =>
    s.activeSessionId ? (s.sessions[s.activeSessionId]?.mode ?? 'normal') : 'normal'
  )
}

export function useActiveSessionName(): string {
  return useStore((s) =>
    s.activeSessionId ? (s.sessions[s.activeSessionId]?.name ?? '') : ''
  )
}

export function useActiveSessionCwd(): string {
  return useStore((s) =>
    s.activeSessionId ? (s.sessions[s.activeSessionId]?.cwd ?? '~') : '~'
  )
}

export function useActiveSessionError(): string | undefined {
  return useStore((s) =>
    s.activeSessionId ? s.sessions[s.activeSessionId]?.sessionError : undefined
  )
}
