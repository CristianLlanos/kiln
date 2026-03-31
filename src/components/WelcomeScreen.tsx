import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useStore } from '../store'
import { Button } from './Button'
import type { ShellIntegrationStatus } from '../store/types'

export function WelcomeScreen() {
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setShellState = useStore((s) => s.setShellState)
  const createNewSession = useStore((s) => s.createNewSession)

  const scriptPath = '~/.config/kiln/shell/kiln.{zsh,bash,fish}'
  const sourceLine = `source "~/.config/kiln/shell/kiln.<shell>"`

  const handleInstall = async () => {
    setInstalling(true)
    setError(null)
    try {
      const status = await invoke<ShellIntegrationStatus>('install_shell_integration')
      if (status.installed && status.in_rc) {
        setShellState('installed')
      }
      await createNewSession()
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Installation failed. You can try again or skip for now.')
      setInstalling(false)
    }
  }

  const handleSkip = async () => {
    setShellState('skipped')
    await createNewSession()
  }

  return (
    <div className="flex flex-col h-full items-center justify-center bg-bg">
      <div className="max-w-lg w-full px-6">
        {/* Heading */}
        <h1 className="text-3xl font-bold text-text-primary mb-2">
          Welcome to Kiln
        </h1>
        <p className="text-text-secondary text-sm leading-relaxed mb-8">
          Kiln needs a small shell integration script to parse command output
          into blocks. This makes your terminal output readable, searchable,
          and organized.
        </p>

        {/* What will happen */}
        <div className="space-y-4 mb-8">
          <div className="bg-surface rounded-lg border border-border p-4">
            <p className="text-text-secondary text-xs uppercase tracking-wide mb-2">
              File created
            </p>
            <code className="text-text-primary text-sm font-mono">
              {scriptPath}
            </code>
          </div>

          <div className="bg-surface rounded-lg border border-border p-4">
            <p className="text-text-secondary text-xs uppercase tracking-wide mb-2">
              Line added to .zshrc
            </p>
            <code className="text-text-primary text-sm font-mono">
              {sourceLine}
            </code>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4">
          <Button
            onClick={handleInstall}
            disabled={installing}
            className="px-6 py-2.5 font-semibold rounded-lg"
          >
            {installing ? 'Installing...' : 'Install & Start'}
          </Button>

          <button
            onClick={handleSkip}
            disabled={installing}
            className="text-text-secondary hover:text-text-primary text-sm transition-colors disabled:opacity-50"
          >
            Skip
          </button>
        </div>

        <p className="text-text-secondary/50 text-xs mt-6 leading-relaxed">
          Skipping launches Kiln in terminal mode without block parsing.
          You can install shell integration later from the command palette.
        </p>
      </div>
    </div>
  )
}
