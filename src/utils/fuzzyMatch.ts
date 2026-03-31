/** Simple fuzzy match: all filter chars must appear in haystack in order */
export function fuzzyMatch(haystack: string, needle: string): boolean {
  return fuzzyScore(haystack, needle) > 0
}

/**
 * Fuzzy match with scoring. Returns 0 for no match, higher = better match.
 * Rewards: exact substring, word-start matches, consecutive characters.
 */
export function fuzzyScore(haystack: string, needle: string): number {
  if (!needle) return 1
  const lower = haystack.toLowerCase()
  const query = needle.toLowerCase()

  // Exact substring match gets highest score
  const substringIdx = lower.indexOf(query)
  if (substringIdx !== -1) {
    // Bonus for matching at word start
    const atWordStart = substringIdx === 0 || lower[substringIdx - 1] === ' '
    return 1000 + (atWordStart ? 500 : 0) + (100 - substringIdx)
  }

  // Fuzzy: all chars must appear in order
  let score = 0
  let hi = 0
  let consecutive = 0
  for (let i = 0; i < query.length; i++) {
    const idx = lower.indexOf(query[i], hi)
    if (idx === -1) return 0
    // Consecutive chars bonus
    if (idx === hi) {
      consecutive++
      score += consecutive * 10
    } else {
      consecutive = 0
      score += 1
    }
    // Word-start bonus
    if (idx === 0 || lower[idx - 1] === ' ') {
      score += 20
    }
    hi = idx + 1
  }
  return score
}
