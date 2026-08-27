import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fuzzyScore } from '../utils/fuzzyMatch'

interface UsePaletteListOptions<T> {
  items: T[]
  keyFn: (item: T) => string
  onSelect: (item: T) => void
  onEscape: () => void
}

export function usePaletteList<T>({ items, keyFn, onSelect, onEscape }: UsePaletteListOptions<T>) {
  const [filter, setFilter] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!filter.trim()) return items
    const query = filter.trim()
    return items
      .map((item) => ({ item, score: fuzzyScore(keyFn(item), query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item)
  }, [items, filter, keyFn])

  // Reset selection when filter changes
  useEffect(() => { setSelectedIndex(0) }, [filter])

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Scroll selected item into view
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        onEscape()
        break
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => filtered.length > 0 ? (i + 1) % filtered.length : 0)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => filtered.length > 0 ? (i - 1 + filtered.length) % filtered.length : 0)
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[selectedIndex]) onSelect(filtered[selectedIndex])
        break
    }
  }, [filtered, selectedIndex, onSelect, onEscape])

  return {
    filter,
    setFilter,
    selectedIndex,
    setSelectedIndex,
    inputRef,
    listRef,
    filtered,
    handleKeyDown,
  }
}
