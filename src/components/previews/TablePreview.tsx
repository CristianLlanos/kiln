import { memo, useMemo } from 'react'
import { DataTable } from './DataTable'

/**
 * Detect column boundaries from consistent multi-space gaps in the output.
 * Parses whitespace-aligned output like `docker ps`, `ls -l`, etc.
 */
function parseTable(text: string): string[][] {
  const rawLines = text.split('\n').filter((l) => l.trim().length > 0)
  if (rawLines.length < 2) return []

  // Strategy: find column boundaries by locating positions where
  // multiple consecutive spaces appear consistently across rows.
  const headerLine = rawLines[0]

  // Find gap positions in the header (positions where 2+ spaces start)
  const gapStarts: number[] = []
  let inGap = false
  for (let i = 0; i < headerLine.length; i++) {
    if (headerLine[i] === ' ') {
      if (!inGap && i > 0 && headerLine[i - 1] !== ' ') {
        // Check if there's at least one more space
        if (i + 1 < headerLine.length && headerLine[i + 1] === ' ') {
          gapStarts.push(i)
          inGap = true
        }
      }
    } else {
      inGap = false
    }
  }

  if (gapStarts.length === 0) {
    // Fallback: just split on 2+ spaces
    return rawLines.map((line) => line.split(/\s{2,}/).map((c) => c.trim()))
  }

  // Build column boundaries: [0, gapEnd1, gapEnd2, ..., EOL]
  const colStarts: number[] = [0]
  for (const gs of gapStarts) {
    // Find where the gap ends (next non-space character)
    let end = gs
    while (end < headerLine.length && headerLine[end] === ' ') end++
    colStarts.push(end)
  }

  return rawLines.map((line) =>
    colStarts.map((start, i) => {
      const end = i + 1 < colStarts.length ? colStarts[i + 1] : line.length
      return (line.slice(start, end) || '').trim()
    }),
  )
}

export const TablePreview = memo(function TablePreview({ text }: { text: string }) {
  const rows = useMemo(() => parseTable(text), [text])
  return <DataTable rows={rows} />
})
