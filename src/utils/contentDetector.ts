import type { ContentType, StyledSegment } from '../store/types'

const MAX_SAMPLE_LINES = 50
/** Skip preview detection for outputs larger than 100KB to prevent parser crashes. */
const MAX_PREVIEW_BYTES = 100_000

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
  if (nonEmpty.length < 2) return false

  // Count columns per row (simple split, not full CSV parsing)
  const counts = nonEmpty.slice(0, 20).map((l) => l.split(delimiter).length)
  const first = counts[0]
  if (first < 2) return false

  // At least 80% of rows should have the same column count as the header
  const matching = counts.filter((c) => c === first).length
  return matching / counts.length >= 0.8
}

function isMarkdown(textLines: string[]): boolean {
  let score = 0
  let features = 0 // require at least 2 distinct markdown features
  let hasHeading = false
  let hasFence = false
  let hasLink = false
  let hasBold = false
  for (const line of textLines) {
    if (/^#{1,6}\s/.test(line)) { score += 2; if (!hasHeading) { hasHeading = true; features++ } }
    if (/^```/.test(line)) { score += 2; if (!hasFence) { hasFence = true; features++ } }
    if (/\*\*.+\*\*/.test(line)) { score += 1; if (!hasBold) { hasBold = true; features++ } }
    if (/^>\s/.test(line)) score += 1
    if (/^[-*]\s/.test(line)) score += 0.5
    if (/\[.+\]\(.+\)/.test(line)) { score += 2; if (!hasLink) { hasLink = true; features++ } }
  }
  return score >= 5 && features >= 2
}

function isTable(textLines: string[]): boolean {
  const nonEmpty = textLines.filter((l) => l.trim().length > 0)
  if (nonEmpty.length < 2) return false

  // Exclude ls -l style output (starts with "total N" line or permission strings)
  const firstLine = nonEmpty[0].trim()
  if (/^total\s+\d+/.test(firstLine)) return false
  if (/^[d\-lrwxst]{10}/.test(firstLine)) return false

  // The first line should look like a header (mostly alphabetic/label words, not data)
  const headerWords = firstLine.split(/\s{2,}/).filter((w) => w.trim())
  if (headerWords.length < 2) return false
  const alphaWords = headerWords.filter((w) => /^[a-zA-Z]/.test(w.trim()))
  if (alphaWords.length / headerWords.length < 0.5) return false

  // Detect column-aligned output by looking for consistent multi-space gaps
  const gapPattern = /\S\s{2,}\S/
  let rowsWithGaps = 0
  for (const line of nonEmpty.slice(0, 20)) {
    if (gapPattern.test(line)) rowsWithGaps++
  }
  // At least 80% of lines should have multi-space column gaps
  return rowsWithGaps / Math.min(nonEmpty.length, 20) >= 0.8 && rowsWithGaps >= 2
}

function isSql(textLines: string[]): boolean {
  const sqlKeywords = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH|FROM|WHERE|JOIN|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK|EXPLAIN)\b/i
  let score = 0
  for (const line of textLines) {
    if (sqlKeywords.test(line)) score += 2
    if (/;\s*$/.test(line)) score += 0.5
    if (score >= 3) return true
  }
  return false
}

function isYaml(textLines: string[]): boolean {
  if (textLines.length < 2) return false
  let score = 0
  for (const line of textLines) {
    if (/^---\s*$/.test(line)) { score += 2 }
    else if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(line)) score += 1.5
    else if (/^\s+-\s+/.test(line)) score += 0.5
    else if (/^\s+[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(line)) score += 1
    if (score >= 4) return true
  }
  return false
}

const EXTENSION_MAP: Record<string, ContentType> = {
  '.json': 'json',
  '.csv': 'csv',
  '.tsv': 'tsv',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.sql': 'sql',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.diff': 'diff',
  '.patch': 'diff',
}

/**
 * Extract a file extension from a command string (e.g., "cat file.json" → ".json").
 * Looks at the last argument that contains a dot.
 */
function extensionFromCommand(command: string): string | null {
  const tokens = command.trim().split(/\s+/)
  // Walk from last token backwards to find one with an extension
  for (let i = tokens.length - 1; i >= 1; i--) {
    const token = tokens[i]
    if (token.startsWith('-')) continue // skip flags
    const clean = token.split(/[?#]/)[0]
    const dotIdx = clean.lastIndexOf('.')
    if (dotIdx > 0) return clean.substring(dotIdx).toLowerCase()
  }
  return null
}

/**
 * Detect the content type of a block's output.
 * First checks file extension in the command, then falls back to content heuristics.
 */
export function detectContentType(lines: StyledSegment[][], command?: string): ContentType {
  if (lines.length === 0) return null

  // Fast path: check file extension in the command
  if (command) {
    const ext = extensionFromCommand(command)
    if (ext && ext in EXTENSION_MAP) return EXTENSION_MAP[ext]
  }

  // Size guard: skip detection if total text exceeds 100KB
  let totalBytes = 0
  for (const line of lines) {
    for (const seg of line) {
      totalBytes += seg.text.length
      if (totalBytes > MAX_PREVIEW_BYTES) return null
    }
  }

  const textLines = extractPlainText(lines, MAX_SAMPLE_LINES)
  if (textLines.every((l) => l.trim() === '')) return null

  // Order matters: more specific checks first
  if (isJson(textLines)) return 'json'
  if (isDiff(textLines)) return 'diff'
  if (isTsv(textLines)) return 'tsv'
  if (isCsv(textLines)) return 'csv'
  if (isYaml(textLines)) return 'yaml'
  if (isSql(textLines)) return 'sql'
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
