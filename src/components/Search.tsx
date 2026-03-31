import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'

export function Search() {
  const inputRef = useRef<HTMLInputElement>(null)

  const searchQuery = useStore((s) => s.searchQuery)
  const searchRegex = useStore((s) => s.searchRegex)
  const searchMatches = useStore((s) => s.searchMatches)
  const searchCurrentIndex = useStore((s) => s.searchCurrentIndex)
  const setSearchQuery = useStore((s) => s.setSearchQuery)
  const setSearchRegex = useStore((s) => s.setSearchRegex)
  const setSearchOpen = useStore((s) => s.setSearchOpen)
  const nextMatch = useStore((s) => s.nextMatch)
  const prevMatch = useStore((s) => s.prevMatch)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Scroll the current match's block into view
  useEffect(() => {
    if (searchMatches.length === 0) return
    const match = searchMatches[searchCurrentIndex]
    if (!match) return

    // Find the block element and scroll it into view
    const blockEl = document.querySelector(`[data-block-id="${match.blockId}"]`)
    if (blockEl) {
      blockEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [searchCurrentIndex, searchMatches])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setSearchOpen(false)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (e.shiftKey) {
          prevMatch()
        } else {
          nextMatch()
        }
        return
      }
    },
    [setSearchOpen, nextMatch, prevMatch],
  )

  const matchCount = searchMatches.length
  const displayIndex = matchCount > 0 ? searchCurrentIndex + 1 : 0

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-surface border-b border-border shrink-0">
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="Search..."
        className="flex-1 bg-surface-raised border border-border rounded px-2 py-1 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-accent font-mono min-w-0"
      />

      {/* Match counter */}
      <span className="text-xs text-text-secondary whitespace-nowrap tabular-nums">
        {searchQuery ? `${displayIndex} of ${matchCount}` : ''}
      </span>

      {/* Regex toggle */}
      <button
        onClick={() => setSearchRegex(!searchRegex)}
        className={`px-1.5 py-0.5 text-xs font-mono rounded border transition-colors ${
          searchRegex
            ? 'bg-accent/20 border-accent text-accent'
            : 'bg-transparent border-border text-text-secondary hover:text-text-primary'
        }`}
        title="Toggle regex"
      >
        .*
      </button>

      {/* Close */}
      <button
        onClick={() => setSearchOpen(false)}
        className="text-text-secondary hover:text-text-primary text-sm px-1"
        title="Close search (Escape)"
      >
        &times;
      </button>
    </div>
  )
}
