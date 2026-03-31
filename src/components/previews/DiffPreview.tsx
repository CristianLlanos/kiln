import { memo, useMemo } from 'react'

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'hunk' | 'header' | 'meta'
  text: string
  lineNumber?: number
}

function parseDiff(text: string): DiffLine[] {
  const rawLines = text.split('\n')
  const result: DiffLine[] = []
  let addLine = 0
  let removeLine = 0

  for (const line of rawLines) {
    if (line.startsWith('diff --git') || line.startsWith('index ')) {
      result.push({ type: 'meta', text: line })
    } else if (line.startsWith('---') || line.startsWith('+++')) {
      result.push({ type: 'header', text: line })
    } else if (line.startsWith('@@')) {
      // Parse hunk header for line numbers
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        removeLine = parseInt(match[1], 10)
        addLine = parseInt(match[2], 10)
      }
      result.push({ type: 'hunk', text: line })
    } else if (line.startsWith('+')) {
      result.push({ type: 'add', text: line, lineNumber: addLine++ })
    } else if (line.startsWith('-')) {
      result.push({ type: 'remove', text: line, lineNumber: removeLine++ })
    } else {
      result.push({ type: 'context', text: line })
      addLine++
      removeLine++
    }
  }

  return result
}

const LINE_STYLES: Record<DiffLine['type'], string> = {
  add: 'bg-green-500/15 text-green-300',
  remove: 'bg-red-500/15 text-red-300',
  hunk: 'bg-accent/10 text-accent',
  header: 'font-semibold text-text-primary',
  meta: 'text-text-secondary',
  context: 'text-text-primary',
}

export const DiffPreview = memo(function DiffPreview({ text }: { text: string }) {
  const lines = useMemo(() => parseDiff(text), [text])

  return (
    <pre className="px-4 text-sm leading-relaxed whitespace-pre-wrap break-all font-mono">
      {lines.map((line, i) => (
        <div key={i} className={`${LINE_STYLES[line.type]} px-2 -mx-2`}>
          {line.lineNumber !== undefined && (
            <span className="inline-block w-10 text-right mr-3 text-text-secondary/50 select-none text-xs">
              {line.lineNumber}
            </span>
          )}
          {line.text}
        </div>
      ))}
    </pre>
  )
})
