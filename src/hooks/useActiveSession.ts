import { useStore } from '../store'
import type { Block, SessionMode } from '../store/types'

export function useActiveSessionBlocks(): Block[] {
  return useStore((s) =>
    s.activeSessionId ? (s.sessions[s.activeSessionId]?.blocks ?? []) : []
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
