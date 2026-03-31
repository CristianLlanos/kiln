import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useStore } from '../store'
import type { CompletionItem } from '../store/types'

/**
 * Determines whether a token looks like a filesystem path.
 * Returns the path-like token if found, or null.
 */
function extractPathToken(input: string): string | null {
  // Get the last whitespace-delimited token
  const tokens = input.split(/\s+/)
  const last = tokens[tokens.length - 1]
  if (!last) return null

  if (
    last.startsWith('/') ||
    last.startsWith('./') ||
    last.startsWith('../') ||
    last.startsWith('~/')  ||
    last === '~'
  ) {
    return last
  }
  return null
}

export function useCompletions(input: string, cwd: string) {
  const setCompletions = useStore((s) => s.setCompletions)
  const dismissCompletions = useStore((s) => s.dismissCompletions)
  // Subscribe only to the active session's command history, not the entire sessions map
  const commandHistory = useStore((s) => {
    const id = s.activeSessionId
    return id ? s.sessions[id]?.commandHistory : undefined
  })

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastInputRef = useRef(input)

  lastInputRef.current = input

  const fetchCompletions = useCallback(async (value: string) => {
    if (!value.trim()) {
      dismissCompletions()
      return
    }

    const pathToken = extractPathToken(value)
    const results: CompletionItem[] = []

    if (pathToken) {
      // Filesystem completion
      try {
        const fsResults = await invoke<CompletionItem[]>('get_completions', {
          partial: pathToken,
          cwd,
        })
        results.push(...fsResults)
      } catch (e) {
        console.error('Filesystem completion failed:', e)
      }
    } else {
      // History completion: session history first, then shell history
      if (commandHistory) {
        const valueLower = value.toLowerCase()
        const sessionMatches = new Set<string>()

        // Walk session history newest-first
        for (let i = commandHistory.length - 1; i >= 0; i--) {
          const cmd = commandHistory[i]
          if (cmd.toLowerCase().startsWith(valueLower) && cmd !== value) {
            if (!sessionMatches.has(cmd)) {
              sessionMatches.add(cmd)
              results.push({ text: cmd, kind: 'history' })
            }
            if (results.length >= 5) break
          }
        }
      }

      // Shell history from Rust backend
      try {
        const histResults = await invoke<CompletionItem[]>('get_history_completions', {
          partial: value,
        })
        // Deduplicate against session results
        const existing = new Set(results.map((r) => r.text))
        for (const item of histResults) {
          if (!existing.has(item.text) && item.text !== value) {
            results.push(item)
            if (results.length >= 15) break
          }
        }
      } catch (e) {
        console.error('History completion failed:', e)
      }
    }

    // Only update if input hasn't changed while we were fetching
    if (lastInputRef.current === value) {
      setCompletions(results)
    }
  }, [cwd, commandHistory, setCompletions, dismissCompletions])

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!input.trim()) {
      dismissCompletions()
      return
    }

    debounceRef.current = setTimeout(() => {
      fetchCompletions(input)
    }, 150)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [input, fetchCompletions, dismissCompletions])
}
