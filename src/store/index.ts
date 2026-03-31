import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Block, CompletionItem, KilnConfig, SearchMatch, Session, SessionMode, ShellIntegrationState, StyledSegment } from './types'
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
  /** Whether the command palette popup is open */
  paletteOpen: boolean

  // Autocomplete state
  completions: CompletionItem[]
  completionIndex: number
  completionsVisible: boolean
  /** True when user is actively navigating completions with arrow keys */
  completionsArrowActive: boolean

  // Search state
  searchOpen: boolean
  searchQuery: string
  searchRegex: boolean
  searchMatches: SearchMatch[]
  searchCurrentIndex: number

  setShellState: (state: ShellIntegrationState) => void
  setConfig: (config: KilnConfig) => void

  // Autocomplete actions
  setCompletions: (items: CompletionItem[]) => void
  setCompletionIndex: (index: number) => void
  setCompletionsVisible: (visible: boolean) => void
  setCompletionsArrowActive: (active: boolean) => void
  dismissCompletions: () => void

  // Search actions
  setSearchOpen: (open: boolean) => void
  setSearchQuery: (query: string) => void
  setSearchRegex: (regex: boolean) => void
  computeSearchMatches: () => void
  nextMatch: () => void
  prevMatch: () => void

  // Error handling
  setSessionError: (sessionId: string, error: string) => void
  restartSession: (sessionId: string) => Promise<void>
  fixShellIntegration: (sessionId: string) => Promise<void>

  initSession: (id: string) => void
  setActiveSession: (id: string) => void
  setPendingCommand: (sessionId: string, command: string) => void
  setSessionCwd: (sessionId: string, cwd: string) => void
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

  // Command history
  pushHistory: (sessionId: string, command: string) => void
  navigateHistory: (sessionId: string, direction: 'up' | 'down', currentInput: string) => string | null

  // Command palette
  setPaletteOpen: (open: boolean) => void
  clearSessionOutput: () => void

  // Header rename trigger
  /** When true, the header rename input should activate */
  triggerRename: boolean
  setTriggerRename: (trigger: boolean) => void
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

/**
 * Trim oldest completed blocks from a session when total line count exceeds the limit.
 * Never removes the currently running block.
 */
function trimScrollback(blocks: Block[], maxLines: number): Block[] {
  let totalLines = 0
  for (const block of blocks) {
    totalLines += block.lines.length
  }
  if (totalLines <= maxLines) return blocks

  // Remove oldest completed blocks from the front until under limit
  let trimmed = blocks.slice()
  while (totalLines > maxLines && trimmed.length > 1) {
    const oldest = trimmed[0]
    if (oldest.status === 'running') break
    totalLines -= oldest.lines.length
    trimmed = trimmed.slice(1)
  }
  return trimmed
}

/** Debounce timer for search computation */
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
const SEARCH_DEBOUNCE_MS = 100

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
  paletteOpen: false,
  triggerRename: false,

  // Autocomplete defaults
  completions: [],
  completionIndex: 0,
  completionsVisible: false,
  completionsArrowActive: false,

  // Search defaults
  searchOpen: false,
  searchQuery: '',
  searchRegex: false,
  searchMatches: [],
  searchCurrentIndex: 0,

  setShellState: (state) => set({ shellState: state }),
  setConfig: (config) => set({ config }),

  // Autocomplete actions
  setCompletions: (items) => set((state) => ({
    completions: items,
    completionIndex: items.length > 0 ? Math.min(state.completionIndex, items.length - 1) : 0,
    // Keep visible during debounce re-fetch if arrows are active
    completionsVisible: items.length > 0 || state.completionsArrowActive,
  })),
  setCompletionIndex: (index) => set({ completionIndex: index }),
  setCompletionsVisible: (visible) => set({ completionsVisible: visible }),
  setCompletionsArrowActive: (active) => set({ completionsArrowActive: active }),
  dismissCompletions: () => set({ completions: [], completionIndex: 0, completionsVisible: false, completionsArrowActive: false }),

  // Search actions
  setSearchOpen: (open) => {
    if (open) {
      set({ searchOpen: true })
    } else {
      set({ searchOpen: false, searchQuery: '', searchMatches: [], searchCurrentIndex: 0 })
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => get().computeSearchMatches(), SEARCH_DEBOUNCE_MS)
  },

  setSearchRegex: (regex) => {
    set({ searchRegex: regex })
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => get().computeSearchMatches(), SEARCH_DEBOUNCE_MS)
  },

  computeSearchMatches: () => {
    const state = get()
    const { searchQuery, searchRegex, activeSessionId, sessions } = state
    if (!searchQuery || !activeSessionId) {
      set({ searchMatches: [], searchCurrentIndex: 0 })
      return
    }

    const session = sessions[activeSessionId]
    if (!session) {
      set({ searchMatches: [], searchCurrentIndex: 0 })
      return
    }

    let regex: RegExp
    try {
      regex = searchRegex
        ? new RegExp(searchQuery, 'gi')
        : new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    } catch {
      // Invalid regex — clear matches
      set({ searchMatches: [], searchCurrentIndex: 0 })
      return
    }

    const matches: SearchMatch[] = []

    for (const block of session.blocks) {
      for (let lineIndex = 0; lineIndex < block.lines.length; lineIndex++) {
        const lineSegments = block.lines[lineIndex]
        // Build a flat string for the entire line so we can find matches that span segments
        let lineText = ''
        const segmentOffsets: { segmentIndex: number; start: number }[] = []
        for (let si = 0; si < lineSegments.length; si++) {
          segmentOffsets.push({ segmentIndex: si, start: lineText.length })
          lineText += lineSegments[si].text
        }

        let match: RegExpExecArray | null
        regex.lastIndex = 0
        while ((match = regex.exec(lineText)) !== null) {
          // Find which segment this match starts in
          let segIdx = 0
          let startInSeg = match.index
          for (let s = segmentOffsets.length - 1; s >= 0; s--) {
            if (segmentOffsets[s].start <= match.index) {
              segIdx = segmentOffsets[s].segmentIndex
              startInSeg = match.index - segmentOffsets[s].start
              break
            }
          }
          matches.push({
            blockId: block.id,
            lineIndex,
            segmentIndex: segIdx,
            startOffset: startInSeg,
            length: match[0].length,
          })
          // Prevent infinite loop on zero-length matches
          if (match[0].length === 0) regex.lastIndex++
        }
      }
    }

    // Try to keep the current index reasonable
    const currentIndex = state.searchCurrentIndex >= matches.length ? 0 : state.searchCurrentIndex
    set({ searchMatches: matches, searchCurrentIndex: currentIndex })
  },

  nextMatch: () => {
    set((state) => {
      if (state.searchMatches.length === 0) return state
      return { searchCurrentIndex: (state.searchCurrentIndex + 1) % state.searchMatches.length }
    })
  },

  prevMatch: () => {
    set((state) => {
      if (state.searchMatches.length === 0) return state
      return {
        searchCurrentIndex: (state.searchCurrentIndex - 1 + state.searchMatches.length) % state.searchMatches.length,
      }
    })
  },

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
          [id]: { id, name: `Session ${nextCounter}`, blocks: [], mode: 'normal', cwd: '~', commandHistory: [], historyIndex: -1, historyDraft: '' },
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

  setSessionCwd: (sessionId, cwd) =>
    set((state) => updateSession(state, sessionId, () => ({ cwd }))),

  setSessionMode: (sessionId, mode) =>
    set((state) => updateSession(state, sessionId, () => ({ mode }))),

  addBlock: (sessionId, block) =>
    set((state) => updateSession(state, sessionId, (session) => ({
      blocks: [...session.blocks, block],
    }))),

  appendSegments: (sessionId, blockId, segments) => {
    set((state) => updateBlock(state, sessionId, blockId, (b) => {
      const newSegments = [...b.segments, ...segments]
      const newLines = appendToLines(b.lines, segments)
      return {
        segments: newSegments,
        lines: newLines,
      }
    }))

    // Trim scrollback after new output arrives
    const maxLines = get().config?.scrollback?.max_lines ?? 10000
    const session = get().sessions[sessionId]
    if (session) {
      const trimmed = trimScrollback(session.blocks, maxLines)
      if (trimmed !== session.blocks) {
        set((state) => updateSession(state, sessionId, () => ({ blocks: trimmed })))
      }
    }
  },

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

  // Command palette
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setTriggerRename: (trigger) => set({ triggerRename: trigger }),

  clearSessionOutput: () =>
    set((state) => {
      const { activeSessionId } = state
      if (!activeSessionId) return state
      return updateSession(state, activeSessionId, () => ({ blocks: [], historyIndex: -1, historyDraft: '' }))
    }),

  // Command history
  pushHistory: (sessionId, command) =>
    set((state) => updateSession(state, sessionId, (session) => {
      const history = session.commandHistory.slice()
      // Don't add duplicates of the last entry
      if (history.length === 0 || history[history.length - 1] !== command) {
        history.push(command)
      }
      // Cap at 1000 entries
      if (history.length > 1000) {
        history.splice(0, history.length - 1000)
      }
      return { commandHistory: history, historyIndex: -1, historyDraft: '' }
    })),

  navigateHistory: (sessionId, direction, currentInput) => {
    const state = get()
    const session = state.sessions[sessionId]
    if (!session || session.commandHistory.length === 0) return null

    const history = session.commandHistory
    let newIndex = session.historyIndex
    let draft = session.historyDraft

    if (direction === 'up') {
      if (newIndex === -1) {
        // Starting navigation — save current input as draft
        draft = currentInput
        newIndex = history.length - 1
      } else if (newIndex > 0) {
        newIndex--
      } else {
        // Already at oldest — don't change
        return history[0]
      }
    } else {
      // down
      if (newIndex === -1) return null // Not navigating
      if (newIndex < history.length - 1) {
        newIndex++
      } else {
        // Past newest — return to draft
        set((state) => updateSession(state, sessionId, () => ({
          historyIndex: -1,
          historyDraft: '',
        })))
        return draft
      }
    }

    set((state) => updateSession(state, sessionId, () => ({
      historyIndex: newIndex,
      historyDraft: draft,
    })))

    return history[newIndex]
  },
}))
