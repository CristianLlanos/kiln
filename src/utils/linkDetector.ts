export interface DetectedLink {
  type: 'url' | 'path'
  start: number
  end: number
  href: string
}

// URL pattern: http(s), ftp, file protocols
const URL_RE =
  /\bhttps?:\/\/[^\s<>"')\]}`]+|ftp:\/\/[^\s<>"')\]}`]+|file:\/\/[^\s<>"')\]}`]+/g

// File path pattern:
//   absolute: /foo/bar, ~/foo/bar
//   relative: ./foo, ../foo
// Optionally followed by :line or :line:col
const PATH_RE =
  /(?:~\/|\.\.?\/|\/(?=[a-zA-Z0-9_.\-]))[\w.\-/]+(?::[\d]+(?::[\d]+)?)?/g

/**
 * Detect URLs and file paths within a plain text string.
 * Returns non-overlapping matches sorted by start position.
 */
export function detectLinks(text: string): DetectedLink[] {
  const results: DetectedLink[] = []

  // Find URLs
  URL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = URL_RE.exec(text)) !== null) {
    let href = m[0]
    // Strip trailing punctuation that's likely not part of the URL
    while (href.length > 0 && /[.,;:!?)}\]>]$/.test(href)) {
      href = href.slice(0, -1)
    }
    results.push({
      type: 'url',
      start: m.index,
      end: m.index + href.length,
      href,
    })
  }

  // Find file paths
  PATH_RE.lastIndex = 0
  while ((m = PATH_RE.exec(text)) !== null) {
    const start = m.index
    const end = start + m[0].length
    // Skip if overlapping with an already-detected URL
    const overlaps = results.some((r) => start < r.end && end > r.start)
    if (overlaps) continue
    results.push({
      type: 'path',
      start,
      end,
      href: m[0],
    })
  }

  results.sort((a, b) => a.start - b.start)
  return results
}
