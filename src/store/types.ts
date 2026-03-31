export interface SegmentStyle {
  fg?: string
  bg?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  dim?: boolean
}

export interface StyledSegment {
  text: string
  style: SegmentStyle
}

export type BlockStatus = 'running' | 'success' | 'error'

export type SessionMode = 'normal' | 'interactive' | 'fallback'

export interface Block {
  id: string
  command: string
  cwd: string
  timestamp: number
  status: BlockStatus
  exitCode?: number
  duration?: number
  segments: StyledSegment[]
  /** Cached line grouping of segments. Updated when segments change. */
  lines: StyledSegment[][]
}

export interface Session {
  id: string
  name: string
  blocks: Block[]
  mode: SessionMode
  /** Set when the PTY crashes or shell process exits unexpectedly */
  sessionError?: string
}

export interface ShellIntegrationStatus {
  installed: boolean
  script_path: string
  in_zshrc: boolean
}

export type ShellIntegrationState = 'checking' | 'pending' | 'installed' | 'skipped'

// ── Configuration types ─────────────────────────────────────────────────────

export interface ShellConfig {
  program: string
  args: string[]
}

export interface AppearanceConfig {
  font_family: string
  font_size: number
  theme: string
  collapse_threshold: number
}

export interface ScrollbackConfig {
  max_lines: number
}

export interface PerformanceConfig {
  max_lines_per_block: number
  stream_throttle_ms: number
}

export interface KeybindingsConfig {
  session_switcher: string
  command_palette: string
  search: string
  new_window: string
  new_session: string
  close_session: string
}

export interface KilnConfig {
  shell: ShellConfig
  appearance: AppearanceConfig
  scrollback: ScrollbackConfig
  performance: PerformanceConfig
  keybindings: KeybindingsConfig
}
