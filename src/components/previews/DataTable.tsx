import { memo } from 'react'

/**
 * Shared table rendering used by CsvPreview and TablePreview.
 */
export const DataTable = memo(function DataTable({ rows }: { rows: string[][] }) {
  if (rows.length === 0) return null

  const header = rows[0]
  const body = rows.slice(1)

  return (
    <div className="px-4 overflow-x-auto">
      <table className="w-full text-sm font-mono border-collapse">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                className="text-left px-3 py-1.5 bg-surface text-text-primary font-semibold border border-border whitespace-nowrap"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-surface/50'}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-3 py-1 border border-border text-text-primary whitespace-nowrap"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})
