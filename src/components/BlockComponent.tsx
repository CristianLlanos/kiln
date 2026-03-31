import { memo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Block, SegmentStyle, StyledSegment } from '../store/types'

const LINE_HEIGHT = 20
const VIRTUALIZE_THRESHOLD = 100

function segmentToStyle(style: SegmentStyle): React.CSSProperties | undefined {
  if (!style.fg && !style.bg && !style.bold && !style.italic && !style.underline && !style.dim) {
    return undefined
  }
  const css: React.CSSProperties = {}
  if (style.fg) css.color = style.fg
  if (style.bg) css.backgroundColor = style.bg
  if (style.bold) css.fontWeight = 'bold'
  if (style.italic) css.fontStyle = 'italic'
  if (style.underline) css.textDecoration = 'underline'
  if (style.dim) css.opacity = 0.6
  return css
}

const STATUS_DISPLAY = {
  running: { color: 'text-accent', icon: '●' },
  success: { color: 'text-green-400', icon: '✓' },
  error: { color: 'text-red-400', icon: '✗' },
} as const

function LineSegments({ segments }: { segments: StyledSegment[] }) {
  if (segments.length === 0) {
    // Empty line — render a zero-width space to preserve height
    return <>{'\u200B'}</>
  }
  return (
    <>
      {segments.map((seg, i) => (
        <span key={i} style={segmentToStyle(seg.style)}>{seg.text}</span>
      ))}
    </>
  )
}

function VirtualizedLines({ lines }: { lines: StyledSegment[][] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 20,
  })

  // Cap the container at 400px so a huge block doesn't take over the viewport.
  // The virtualizer handles scrolling within.
  const maxHeight = 400
  const totalSize = virtualizer.getTotalSize()
  const containerHeight = Math.min(totalSize, maxHeight)

  return (
    <div
      ref={parentRef}
      className="overflow-y-auto px-4"
      style={{ height: containerHeight }}
    >
      <pre
        className="text-sm leading-relaxed whitespace-pre-wrap break-all font-mono relative"
        style={{ height: totalSize }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.index}
            className="absolute left-0 right-0"
            style={{
              height: LINE_HEIGHT,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <LineSegments segments={lines[virtualRow.index]} />
          </div>
        ))}
      </pre>
    </div>
  )
}

function SimpleLines({ lines }: { lines: StyledSegment[][] }) {
  return (
    <pre className="px-4 text-sm leading-relaxed whitespace-pre-wrap break-all font-mono">
      {lines.map((lineSegments, lineIdx) => (
        <div key={lineIdx} style={{ minHeight: LINE_HEIGHT }}>
          <LineSegments segments={lineSegments} />
        </div>
      ))}
    </pre>
  )
}

export const BlockComponent = memo(function BlockComponent({ block }: { block: Block }) {
  const { color: statusColor, icon: statusIcon } = STATUS_DISPLAY[block.status]

  const useVirtualization = block.lines.length > VIRTUALIZE_THRESHOLD

  return (
    <div className="border-b border-border py-3">
      {/* Block header */}
      <div className="flex items-center gap-2 px-4 pb-1 text-xs">
        <span className={statusColor}>{statusIcon}</span>
        <span className="font-mono font-semibold text-text-primary">
          {block.command || '…'}
        </span>
        {block.cwd && (
          <span className="text-text-secondary ml-auto">{block.cwd}</span>
        )}
        {block.duration !== undefined && (
          <span className="text-text-secondary">
            {block.duration < 1
              ? `${Math.round(block.duration * 1000)}ms`
              : `${block.duration.toFixed(1)}s`}
          </span>
        )}
      </div>

      {/* Block output */}
      {block.lines.length > 0 && (
        useVirtualization ? (
          <VirtualizedLines lines={block.lines} />
        ) : (
          <SimpleLines lines={block.lines} />
        )
      )}
    </div>
  )
})
