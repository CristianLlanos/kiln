import { useEffect, useRef } from 'react'
import { useStore } from '../store'

const kindIcons: Record<string, string> = {
  directory: '\uD83D\uDCC1',
  file: '\uD83D\uDCC4',
  history: '\uD83D\uDD52',
}

const kindLabels: Record<string, string> = {
  directory: 'dir',
  file: 'file',
  history: 'history',
}

export function Autocomplete() {
  const completions = useStore((s) => s.completions)
  const completionIndex = useStore((s) => s.completionIndex)
  const completionsVisible = useStore((s) => s.completionsVisible)
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll the selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]')
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [completionIndex])

  if (!completionsVisible || completions.length === 0) {
    return null
  }

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 mx-0 max-h-[200px] overflow-y-auto bg-surface-raised border border-border rounded shadow-lg z-20"
    >
      {completions.map((item, index) => (
        <div
          key={`${item.kind}-${item.text}`}
          data-selected={index === completionIndex}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-mono cursor-pointer ${
            index === completionIndex
              ? 'bg-accent/20 text-text-primary'
              : 'text-text-secondary hover:bg-surface/50'
          }`}
          onMouseDown={(e) => {
            // Prevent blur on the textarea
            e.preventDefault()
          }}
          onClick={() => {
            // Accept this completion via store
            useStore.getState().setCompletionIndex(index)
            // Dispatch a custom event that App.tsx listens for
            window.dispatchEvent(new CustomEvent('kiln:accept-completion', { detail: { index } }))
          }}
        >
          <span className="w-5 text-center shrink-0 text-xs">
            {kindIcons[item.kind] || ''}
          </span>
          <span className="flex-1 truncate">{item.text}</span>
          <span className="text-xs text-text-secondary/60 shrink-0">
            {kindLabels[item.kind] || item.kind}
          </span>
        </div>
      ))}
    </div>
  )
}
