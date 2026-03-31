import type { ContentType, StyledSegment } from '../store/types'

const MAX_SAMPLE_LINES = 50

/**
 * Extract plain text from a block's lines (first N lines only for performance).
 */
function extractPlainText(lines: StyledSegment[][], maxLines: number): string[] {
  const result: string[] = []
  const limit = Math.min(lines.length, maxLines)
  for (let i = 0; i < limit; i++) {
    result.push(lines[i].map((s) => s.text).join(''))
  }
  return result
}

function isJson(textLines: string[]): boolean {
  const joined = textLines.join('\n').trim()
  if (!joined) return false
  const first = joined[0]
  if (first !== '{' && first !== '[') return false
  try {
    JSON.parse(joined)
    return true
  } catch {
    return false
  }
}

function isDiff(textLines: string[]): boolean {
  let diffMarkers = 0
  let hunkHeaders = 0
  for (const line of textLines) {
    if (line.startsWith('---') || line.startsWith('+++')) diffMarkers++
    if (line.startsWith('@@')) hunkHeaders++
    if (line.startsWith('diff --git')) return true
  }
  // Need at least a hunk header and some file markers
  return hunkHeaders >= 1 && diffMarkers >= 1
}

function isCsv(textLines: string[]): boolean {
  return isDelimited(textLines, ',')
}

function isTsv(textLines: string[]): boolean {
  return isDelimited(textLines, '\t')
}

function isDelimited(textLines: string[], delimiter: string): boolean {
  const nonEmpty = textLines.filter((l) => l.trim().length > 0)
  if (nonEmpty.length < 3) return false

  // Count columns per row (simple split, not full CSV parsing)
  const counts = nonEmpty.slice(0, 20).map((l) => l.split(delimiter).length)
  const first = counts[0]
  if (first < 2) return false

  // All rows must have the same column count
  return counts.every((c) => c === first)
}

function isMarkdown(textLines: string[]): boolean {
  let score = 0
  for (const line of textLines) {
    if (/^#{1,6}\s/.test(line)) score += 3
    if (/^```/.test(line)) score += 2
    if (/\*\*.+\*\*/.test(line)) score += 1
    if (/^>\s/.test(line)) score += 1
    if (/^[-*]\s/.test(line)) score += 0.5
    if (/\[.+\]\(.+\)/.test(line)) score += 2
  }
  return score >= 3
}

function isTable(textLines: string[]): boolean {
  const nonEmpty = textLines.filter((l) => l.trim().length > 0)
  if (nonEmpty.length < 2) return false

  // Detect column-aligned output by looking for consistent multi-space gaps
  const gapPattern = /\S\s{2,}\S/
  let rowsWithGaps = 0
  for (const line of nonEmpty.slice(0, 20)) {
    if (gapPattern.test(line)) rowsWithGaps++
  }
  // At least 80% of lines should have multi-space column gaps
  return rowsWithGaps / Math.min(nonEmpty.length, 20) >= 0.8 && rowsWithGaps >= 2
}

/**
 * Detect the content type of a block's output.
 * Samples only the first ~50 lines for performance.
 */
export function detectContentType(lines: StyledSegment[][]): ContentType {
  if (lines.length === 0) return null

  const textLines = extractPlainText(lines, MAX_SAMPLE_LINES)
  if (textLines.every((l) => l.trim() === '')) return null

  // Order matters: more specific checks first
  if (isJson(textLines)) return 'json'
  if (isDiff(textLines)) return 'diff'
  if (isTsv(textLines)) return 'tsv'
  if (isCsv(textLines)) return 'csv'
  if (isMarkdown(textLines)) return 'markdown'
  if (isTable(textLines)) return 'table'

  return null
}

/**
 * Extract the full plain text from all lines of a block.
 */
export function getBlockPlainText(lines: StyledSegment[][]): string {
  return lines.map((line) => line.map((s) => s.text).join('')).join('\n')
}
