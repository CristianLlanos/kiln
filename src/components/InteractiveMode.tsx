import { useEffect, useRef, useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'

const KILN_THEME = {
  background: '#0F0F14',
  foreground: '#E8E8F0',
  cursor: '#7F52FF',
  cursorAccent: '#0F0F14',
  selectionBackground: '#7F52FF40',
  selectionForeground: '#FFFFFF',
  black: '#16161E',
  red: '#E24462',
  green: '#4ADE80',
  yellow: '#E2B340',
  blue: '#7F52FF',
  magenta: '#B125EA',
  cyan: '#56B6C2',
  white: '#A0A0B8',
  brightBlack: '#2A2A3A',
  brightRed: '#FF6B81',
  brightGreen: '#69FF94',
  brightYellow: '#FFFFA5',
  brightBlue: '#A78BFA',
  brightMagenta: '#D946EF',
  brightCyan: '#7EDCE2',
  brightWhite: '#E8E8F0',
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

  const sendResize = useCallback(
    (cols: number, rows: number) => {
      invoke('resize_pty', { sessionId, cols, rows }).catch(console.error)
    },
    [sessionId],
  )

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      theme: KILN_THEME,
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
  }, [sessionId, sendResize])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ backgroundColor: KILN_THEME.background }}
    />
  )
}
