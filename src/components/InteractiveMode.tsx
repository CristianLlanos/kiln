import { useEffect, useRef, useCallback, useMemo } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { useStore } from '../store'
import type { KilnTheme } from '../store/types'
import '@xterm/xterm/css/xterm.css'

const DEFAULT_XTERM_THEME = {
  background: '#0D0D12',
  foreground: '#E4E4EF',
  cursor: '#8B6AFF',
  cursorAccent: '#0D0D12',
  selectionBackground: '#8B6AFF40',
  selectionForeground: '#FFFFFF',
  black: '#15151E',
  red: '#D09088',
  green: '#5CD89A',
  yellow: '#F0C060',
  blue: '#8B6AFF',
  magenta: '#B44AEA',
  cyan: '#60C8D0',
  white: '#B0B0C8',
  brightBlack: '#404058',
  brightRed: '#D8A098',
  brightGreen: '#80EAAA',
  brightYellow: '#FFD880',
  brightBlue: '#AA90FF',
  brightMagenta: '#D070F0',
  brightCyan: '#80E0E8',
  brightWhite: '#E4E4EF',
}

function buildXtermTheme(theme: KilnTheme | null) {
  if (!theme) return DEFAULT_XTERM_THEME
  const { colors, terminal } = theme
  return {
    background: colors.background,
    foreground: colors.text_primary,
    cursor: colors.accent_primary,
    cursorAccent: colors.background,
    selectionBackground: colors.accent_primary + '40',
    selectionForeground: '#FFFFFF',
    black: terminal.black,
    red: terminal.red,
    green: terminal.green,
    yellow: terminal.yellow,
    blue: terminal.blue,
    magenta: terminal.magenta,
    cyan: terminal.cyan,
    white: terminal.white,
    brightBlack: terminal.bright_black,
    brightRed: terminal.bright_red,
    brightGreen: terminal.bright_green,
    brightYellow: terminal.bright_yellow,
    brightBlue: terminal.bright_blue,
    brightMagenta: terminal.bright_magenta,
    brightCyan: terminal.bright_cyan,
    brightWhite: terminal.bright_white,
  }
}

interface PtyStreamPayload {
  session_id: string
  data: string // base64-encoded
}

interface InteractiveModeProps {
  sessionId: string
}

export function InteractiveMode({ sessionId }: InteractiveModeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const storeTheme = useStore((s) => s.theme)
  const xtermTheme = useMemo(() => buildXtermTheme(storeTheme), [storeTheme])

  // Update xterm theme when store theme changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = xtermTheme
    }
  }, [xtermTheme])

  const sendResize = useCallback(
    (cols: number, rows: number) => {
      invoke('resize_pty', { sessionId, cols, rows }).catch(console.error)
    },
    [sessionId],
  )

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      theme: xtermTheme,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminal.open(containerRef.current)

    // Try to load WebGL addon for performance; fall back gracefully
    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        webglAddon.dispose()
      })
      terminal.loadAddon(webglAddon)
    } catch {
      // WebGL not available — canvas renderer is fine
    }

    fitAddon.fit()
    sendResize(terminal.cols, terminal.rows)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Forward keyboard input to PTY
    const onDataDisposable = terminal.onData((data) => {
      invoke('write_stdin', { sessionId, data }).catch(console.error)
    })

    // Listen for raw PTY stream data (base64-encoded)
    const unlistenPromise = listen<PtyStreamPayload>('pty_stream', (event) => {
      if (event.payload.session_id !== sessionId) return

      // Decode base64 to Uint8Array
      const bytes = Uint8Array.from(atob(event.payload.data), c => c.charCodeAt(0))
      terminal.write(bytes)
    })

    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
        sendResize(terminalRef.current.cols, terminalRef.current.rows)
      }
    }

    // Use ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(containerRef.current)

    // Focus the terminal
    terminal.focus()

    // Signal the backend that xterm.js is ready, and replay any buffered data
    invoke<string>('interactive_ready', { sessionId }).then((bufferedBase64) => {
      if (bufferedBase64) {
        const bytes = Uint8Array.from(atob(bufferedBase64), c => c.charCodeAt(0))
        if (bytes.length > 0) {
          terminal.write(bytes)
        }
      }
      // Force TUI programs to redraw by triggering SIGWINCH via a size change.
      // Briefly resize to cols-1, then back to actual size — guarantees the
      // PTY sees a change even if dimensions already match.
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
        const { cols, rows } = terminalRef.current
        sendResize(Math.max(1, cols - 1), rows)
        requestAnimationFrame(() => {
          sendResize(cols, rows)
        })
      }
    }).catch(console.error)

    return () => {
      onDataDisposable.dispose()
      unlistenPromise.then((fn) => fn())
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, sendResize])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ backgroundColor: xtermTheme.background }}
    />
  )
}
