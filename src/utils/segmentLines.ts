import type { StyledSegment } from '../store/types'

/**
 * Groups a flat array of StyledSegments into lines (split on '\n').
 * Each line is an array of segments. Used for full (re)computation.
 */
export function segmentsToLines(segments: StyledSegment[]): StyledSegment[][] {
  if (segments.length === 0) return []

  const lines: StyledSegment[][] = [[]]

  for (const seg of segments) {
    const parts = seg.text.split('\n')

    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        // Start a new line
        lines.push([])
      }
      const text = parts[i]
      if (text.length > 0) {
        lines[lines.length - 1].push({ text, style: seg.style })
      }
    }
  }

  return lines
}

/**
 * Incrementally appends new segments to existing lines.
 * Only processes newSegments, splicing into the last partial line.
 * Returns a new array (does not mutate existingLines).
 */
export function appendToLines(existingLines: StyledSegment[][], newSegments: StyledSegment[]): StyledSegment[][] {
  if (newSegments.length === 0) return existingLines

  // Start by copying existing lines; the last line may be extended
  const lines: StyledSegment[][] = existingLines.length > 0
    ? existingLines.slice(0, -1).concat([existingLines[existingLines.length - 1].slice()])
    : [[]]

  for (const seg of newSegments) {
    const parts = seg.text.split('\n')

    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        lines.push([])
      }
      const text = parts[i]
      if (text.length > 0) {
        lines[lines.length - 1].push({ text, style: seg.style })
      }
    }
  }

  return lines
}
