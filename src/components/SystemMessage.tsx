import { useStore } from '../store'
import { Button } from './Button'

interface SystemMessageProps {
  sessionId: string
  error: string
}

/**
 * Inline system message block displayed when a PTY session crashes or the
 * shell process exits unexpectedly. Renders in the block list area (not a
 * modal or toast) so that previous command blocks remain visible above it.
 */
export function SystemMessage({ sessionId, error }: SystemMessageProps) {
  const restartSession = useStore((s) => s.restartSession)
  const createNewSession = useStore((s) => s.createNewSession)

  return (
    <div className="mx-4 my-3 rounded border border-error/40 bg-error/5 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-error text-sm shrink-0">!</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary font-medium">
            Session ended unexpectedly
          </p>
          <p className="text-xs text-text-secondary mt-1 font-mono">
            {error}
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              onClick={() => restartSession(sessionId)}
              className="px-3 py-1.5 text-xs"
            >
              Restart Session
            </Button>
            <Button
              variant="ghost"
              onClick={() => createNewSession()}
              className="px-3 py-1.5 text-xs"
            >
              New Session
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
