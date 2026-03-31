/** Simple fuzzy match: all filter chars must appear in haystack in order */
export function fuzzyMatch(haystack: string, needle: string): boolean {
  const lower = haystack.toLowerCase()
  const chars = needle.toLowerCase()
  let hi = 0
  for (let i = 0; i < chars.length; i++) {
    const idx = lower.indexOf(chars[i], hi)
    if (idx === -1) return false
    hi = idx + 1
  }
  return true
}
