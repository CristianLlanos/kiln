import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useStore } from '../store'
import type { CompletionItem } from '../store/types'

/**
 * Extract the last whitespace-delimited token from input.
 */
function extractLastToken(input: string): string {
  const tokens = input.split(/\s+/)
  return tokens[tokens.length - 1] ?? ''
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

    const results: CompletionItem[] = []
    const lastToken = extractLastToken(value)

    // Always try filesystem completions for the last token (bare names in cwd)
    if (lastToken) {
      try {
        const fsResults = await invoke<CompletionItem[]>('get_completions', {
          partial: lastToken,
          cwd,
        })
        results.push(...fsResults)
      } catch (e) {
        console.error('Filesystem completion failed:', e)
      }
    }

    // Always include history completions
    if (commandHistory) {
      const valueLower = value.toLowerCase()
      const existing = new Set(results.map((r) => r.text))
      let added = 0

      // Walk session history newest-first
      for (let i = commandHistory.length - 1; i >= 0; i--) {
        const cmd = commandHistory[i]
        if (cmd.toLowerCase().startsWith(valueLower) && cmd !== value && !existing.has(cmd)) {
          existing.add(cmd)
          results.push({ text: cmd, kind: 'history' })
          added++
          if (added >= 5) break
        }
      }
    }

    // Shell history from Rust backend
    try {
      const histResults = await invoke<CompletionItem[]>('get_history_completions', {
        partial: value,
      })
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

    // Cap total results
    const capped = results.slice(0, 15)

    // If the only results exactly match the input, don't show completions
    // (user already has the right text — no point showing a dropdown)
    const currentToken = (value.split(/\s+/).pop() ?? '')
    const filtered = capped.filter((c) => c.text !== currentToken)
    if (filtered.length === 0 && capped.length > 0) {
      dismissCompletions()
      return
    }

    // Only update if input hasn't changed while we were fetching
    if (lastInputRef.current === value) {
      setCompletions(capped)
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
