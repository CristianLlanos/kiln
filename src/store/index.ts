import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Block, KilnConfig, Session, SessionMode, ShellIntegrationState, StyledSegment } from './types'
import { appendToLines } from '../utils/segmentLines'

interface AppState {
  sessions: Record<string, Session>
  activeSessionId: string | null
  /** MRU-ordered list of session ids */
  sessionOrder: string[]
  // Track the last command typed per session so block_start can attach it
  pendingCommands: Record<string, string>
  /** Whether the session switcher popup is open */
  switcherOpen: boolean
  /** Whether the switcher is filtered to running sessions only */
  switcherRunningOnly: boolean
  /** Counter for generating default session names */
  sessionCounter: number
  /** Shell integration lifecycle state */
  shellState: ShellIntegrationState
  /** Application configuration loaded from config.toml */
  config: KilnConfig | null

  setShellState: (state: ShellIntegrationState) => void
  setConfig: (config: KilnConfig) => void

  // Error handling
  setSessionError: (sessionId: string, error: string) => void
  restartSession: (sessionId: string) => Promise<void>
  fixShellIntegration: (sessionId: string) => Promise<void>

  initSession: (id: string) => void
  setActiveSession: (id: string) => void
  setPendingCommand: (sessionId: string, command: string) => void
  setSessionMode: (sessionId: string, mode: SessionMode) => void

  addBlock: (sessionId: string, block: Block) => void
  appendSegments: (sessionId: string, blockId: string, segments: StyledSegment[]) => void
  completeBlock: (sessionId: string, blockId: string, exitCode: number, duration: number) => void

  // Session management
  createNewSession: () => Promise<void>
  switchSession: (id: string) => void
  closeSession: (id: string) => Promise<void>
  renameSession: (id: string, name: string) => void
  setSwitcherOpen: (open: boolean) => void
  toggleSwitcherRunningOnly: () => void
}

/** Update a session by id, returning unchanged state if session not found. */
function updateSession(
  state: AppState,
  sessionId: string,
  updater: (session: Session) => Partial<Session>,
): Partial<AppState> {
  const session = state.sessions[sessionId]
  if (!session) return state
  return {
    sessions: {
      ...state.sessions,
      [sessionId]: { ...session, ...updater(session) },
    },
  }
}

/** Update a specific block within a session. Only creates a new object for the target block. */
function updateBlock(
  state: AppState,
  sessionId: string,
  blockId: string,
  updater: (block: Block) => Partial<Block>,
): Partial<AppState> {
  return updateSession(state, sessionId, (session) => {
    const idx = session.blocks.findIndex((b) => b.id === blockId)
    if (idx === -1) return {}
    const updated = { ...session.blocks[idx], ...updater(session.blocks[idx]) }
    const blocks = session.blocks.slice()
    blocks[idx] = updated
    return { blocks }
  })
}

/** Move a session to the front of the MRU order */
function bumpMRU(order: string[], id: string): string[] {
  return [id, ...order.filter((s) => s !== id)]
}

export const useStore = create<AppState>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  sessionOrder: [],
  pendingCommands: {},
  switcherOpen: false,
  switcherRunningOnly: false,
  sessionCounter: 0,
  shellState: 'checking' as ShellIntegrationState,
  config: null,

  setShellState: (state) => set({ shellState: state }),
  setConfig: (config) => set({ config }),

  // Error handling
  setSessionError: (sessionId, error) =>
    set((state) => updateSession(state, sessionId, () => ({ sessionError: error }))),

  restartSession: async (sessionId) => {
    const session = get().sessions[sessionId]
    const name = session?.name ?? 'Session'
    await get().closeSession(sessionId)
    // closeSession auto-creates a new session if none left
    // Rename the new active session to preserve the name
    const newActiveId = get().activeSessionId
    if (newActiveId) {
      get().renameSession(newActiveId, name)
    }
  },

  fixShellIntegration: async (sessionId) => {
    try {
      await invoke('install_shell_integration')
      set({ shellState: 'installed' as ShellIntegrationState })
      await get().restartSession(sessionId)
    } catch (e) {
      console.error('Failed to fix shell integration:', e)
    }
  },

  initSession: (id) =>
    set((state) => {
      const nextCounter = state.sessionCounter + 1
      return {
        sessions: {
          ...state.sessions,
          [id]: { id, name: `Session ${nextCounter}`, blocks: [], mode: 'normal' },
        },
        activeSessionId: id,
        sessionOrder: bumpMRU(state.sessionOrder, id),
        sessionCounter: nextCounter,
      }
    }),

  setActiveSession: (id) =>
    set((state) => ({
      activeSessionId: id,
      sessionOrder: bumpMRU(state.sessionOrder, id),
    })),

  setPendingCommand: (sessionId, command) =>
    set((state) => ({
      pendingCommands: {
        ...state.pendingCommands,
        [sessionId]: command,
      },
    })),

  setSessionMode: (sessionId, mode) =>
    set((state) => updateSession(state, sessionId, () => ({ mode }))),

  addBlock: (sessionId, block) =>
    set((state) => updateSession(state, sessionId, (session) => ({
      blocks: [...session.blocks, block],
    }))),

  appendSegments: (sessionId, blockId, segments) =>
    set((state) => updateBlock(state, sessionId, blockId, (b) => {
      const newSegments = [...b.segments, ...segments]
      const newLines = appendToLines(b.lines, segments)
      return {
        segments: newSegments,
        lines: newLines,
      }
    })),

  completeBlock: (sessionId, blockId, exitCode, duration) =>
    set((state) => updateBlock(state, sessionId, blockId, () => ({
      status: exitCode === 0 ? ('success' as const) : ('error' as const),
      exitCode,
      duration,
    }))),

  // Session management actions

  createNewSession: async () => {
    const sessionId = crypto.randomUUID()
    get().initSession(sessionId)
    try {
      await invoke('create_session', { sessionId })
    } catch (e) {
      console.error('Failed to create session PTY:', e)
    }
  },

  switchSession: (id) => {
    const state = get()
    if (state.sessions[id]) {
      set({
        activeSessionId: id,
        sessionOrder: bumpMRU(state.sessionOrder, id),
        switcherOpen: false,
      })
    }
  },

  closeSession: async (id) => {
    const state = get()
    const order = state.sessionOrder.filter((s) => s !== id)
    const { [id]: _removed, ...remainingSessions } = state.sessions
    const { [id]: _removedCmd, ...remainingPending } = state.pendingCommands

    // Pick the next active session (next in MRU, or null)
    let nextActive = state.activeSessionId === id
      ? (order[0] ?? null)
      : state.activeSessionId

    set({
      sessions: remainingSessions,
      sessionOrder: order,
      activeSessionId: nextActive,
      pendingCommands: remainingPending,
    })

    try {
      await invoke('close_session', { sessionId: id })
    } catch (e) {
      console.error('Failed to close session PTY:', e)
    }

    // If no sessions left, create a new one
    if (order.length === 0) {
      await get().createNewSession()
    }
  },

  renameSession: (id, name) =>
    set((state) => updateSession(state, id, () => ({ name }))),

  setSwitcherOpen: (open) => set({
    switcherOpen: open,
    ...(open ? {} : { switcherRunningOnly: false }),
  }),

  toggleSwitcherRunningOnly: () =>
    set((state) => ({ switcherRunningOnly: !state.switcherRunningOnly })),
}))
