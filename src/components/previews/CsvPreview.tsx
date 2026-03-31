import { memo, useMemo } from 'react'
import { DataTable } from './DataTable'

function parseCsvRow(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

function parseCsvRows(text: string, delimiter: string): string[][] {
  return text.split('\n').filter((l) => l.trim().length > 0).map((line) => parseCsvRow(line, delimiter))
}

export const CsvPreview = memo(function CsvPreview({
  text,
  delimiter = ',',
}: {
  text: string
  delimiter?: string
}) {
  const rows = useMemo(() => parseCsvRows(text, delimiter), [text, delimiter])
  return <DataTable rows={rows} />
})
