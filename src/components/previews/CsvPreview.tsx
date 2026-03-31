import { memo, useMemo } from 'react'
import { DataTable } from './DataTable'

function parseCsvRows(text: string, delimiter: string): string[][] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  return lines.map((line) => line.split(delimiter).map((cell) => cell.trim()))
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
