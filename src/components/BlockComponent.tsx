import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from '../store'
import type { Block, ContentType, SearchMatch, SegmentStyle, StyledSegment } from '../store/types'
import { invoke } from '@tauri-apps/api/core'
import { detectLinks, type DetectedLink } from '../utils/linkDetector'
import { copyBlockOutput, copyBlockCommand, copyBlockAsMarkdown } from '../utils/clipboard'
import { detectContentType, getBlockPlainText } from '../utils/contentDetector'
import { formatTimeAgo, formatAbsoluteTime } from '../utils/session'
import { JsonPreview, DiffPreview, CsvPreview, MarkdownPreview, TablePreview, SqlPreview, YamlPreview } from './previews'

const LINE_HEIGHT = 20
const VIRTUALIZE_THRESHOLD = 100

/** Shared 30s tick for all RelativeTimestamp instances — one interval, not N. */
let tickListeners = new Set<() => void>()
let tickInterval: ReturnType<typeof setInterval> | null = null

function subscribeTimestampTick(cb: () => void) {
  tickListeners.add(cb)
  if (!tickInterval) {
    tickInterval = setInterval(() => tickListeners.forEach((fn) => fn()), 30_000)
  }
  return () => {
    tickListeners.delete(cb)
    if (tickListeners.size === 0 && tickInterval) {
      clearInterval(tickInterval)
      tickInterval = null
    }
  }
}

function RelativeTimestamp({ timestamp }: { timestamp: number }) {
  const [, setTick] = useState(0)
  useEffect(() => subscribeTimestampTick(() => setTick((t) => t + 1)), [])
  return (
    <span className="text-text-secondary/50 shrink-0" title={formatAbsoluteTime(timestamp)}>
      {formatTimeAgo(timestamp)}
    </span>
  )
}

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

// ── Search highlight helpers ────────────────────────────────────────────────

interface HighlightRange {
  start: number
  end: number
  isCurrent: boolean
}

/**
 * Given a line's segments and highlight ranges (in line-level character offsets),
 * split the segments so matches get highlight wrappers.
 */
function splitSegmentsWithHighlights(
  segments: StyledSegment[],
  highlights: HighlightRange[],
): React.ReactNode[] {
  if (highlights.length === 0) {
    // No highlights — render normally
    return segments.map((seg, i) => (
      <span key={i} style={segmentToStyle(seg.style)}>{seg.text}</span>
    ))
  }

  const nodes: React.ReactNode[] = []
  let charOffset = 0
  let hlIdx = 0
  let nodeKey = 0

  for (const seg of segments) {
    const segStart = charOffset
    const segEnd = charOffset + seg.text.length
    let pos = 0 // position within this segment's text

    while (pos < seg.text.length && hlIdx < highlights.length) {
      const hl = highlights[hlIdx]
      const hlStartInSeg = Math.max(hl.start - segStart, 0)
      const hlEndInSeg = Math.min(hl.end - segStart, seg.text.length)

      if (hlEndInSeg <= 0) {
        // Highlight is entirely before this segment — skip it
        hlIdx++
        continue
      }
      if (hlStartInSeg >= seg.text.length) {
        // Highlight starts after this segment — break to next segment
        break
      }

      // Emit text before the highlight
      if (pos < hlStartInSeg) {
        nodes.push(
          <span key={nodeKey++} style={segmentToStyle(seg.style)}>
            {seg.text.slice(pos, hlStartInSeg)}
          </span>,
        )
      }

      // Emit highlighted text
      const highlightClass = hl.isCurrent ? 'bg-yellow-500/60 rounded-sm' : 'bg-yellow-500/30 rounded-sm'
      nodes.push(
        <span key={nodeKey++} style={segmentToStyle(seg.style)}>
          <mark className={highlightClass}>
            {seg.text.slice(hlStartInSeg, hlEndInSeg)}
          </mark>
        </span>,
      )

      pos = hlEndInSeg

      // If highlight ends within or at the end of this segment, advance to next highlight
      if (hl.end <= segEnd) {
        hlIdx++
      } else {
        // Highlight continues into next segment
        break
      }
    }

    // Emit remaining text in segment
    if (pos < seg.text.length) {
      nodes.push(
        <span key={nodeKey++} style={segmentToStyle(seg.style)}>
          {seg.text.slice(pos)}
        </span>,
      )
    }

    charOffset = segEnd
  }

  return nodes
}

/**
 * Collect highlight ranges for a specific block + line from the search matches.
 */
function getLineHighlights(
  blockId: string,
  lineIndex: number,
  searchMatches: SearchMatch[],
  searchCurrentIndex: number,
  lineSegments: StyledSegment[],
): HighlightRange[] {
  // Compute segment start offsets within the line
  const segmentStarts: number[] = []
  let offset = 0
  for (const seg of lineSegments) {
    segmentStarts.push(offset)
    offset += seg.text.length
  }

  const ranges: HighlightRange[] = []

  for (let mi = 0; mi < searchMatches.length; mi++) {
    const m = searchMatches[mi]
    if (m.blockId !== blockId || m.lineIndex !== lineIndex) continue

    const charStart = (segmentStarts[m.segmentIndex] ?? 0) + m.startOffset
    ranges.push({
      start: charStart,
      end: charStart + m.length,
      isCurrent: mi === searchCurrentIndex,
    })
  }

  return ranges
}

// ── Link rendering helpers ──────────────────────────────────────────────────

function handleLinkClick(e: React.MouseEvent, link: DetectedLink) {
  e.preventDefault()
  e.stopPropagation()
  if (link.type === 'url') {
    invoke('open_url', { url: link.href }).catch(console.error)
  } else {
    // File path: copy to clipboard
    navigator.clipboard.writeText(link.href)
  }
}

/**
 * Render a single segment's text, splitting at detected link boundaries.
 */
function renderSegmentWithLinks(
  text: string,
  style: React.CSSProperties | undefined,
  links: DetectedLink[],
  keyBase: number,
): React.ReactNode[] {
  if (links.length === 0) {
    return [<span key={keyBase} style={style}>{text}</span>]
  }
  const nodes: React.ReactNode[] = []
  let pos = 0
  let k = keyBase

  for (const link of links) {
    if (link.start > pos) {
      nodes.push(<span key={k++} style={style}>{text.slice(pos, link.start)}</span>)
    }
    nodes.push(
      <a
        key={k++}
        style={style}
        className="text-accent underline cursor-pointer"
        title={link.type === 'path' ? `Click to copy: ${link.href}` : link.href}
        onClick={(e) => handleLinkClick(e, link)}
      >
        {text.slice(link.start, link.end)}
      </a>,
    )
    pos = link.end
  }

  if (pos < text.length) {
    nodes.push(<span key={k++} style={style}>{text.slice(pos)}</span>)
  }
  return nodes
}

// ── Line rendering ──────────────────────────────────────────────────────────

const TRUNCATION_RE = /^\[\s*\.{3}\s*\d+\s+lines?\s+truncated\s*\.{3}\s*\]$/

function LineSegments({ segments }: { segments: StyledSegment[] }) {
  if (segments.length === 0) {
    return <>{'\u200B'}</>
  }

  const fullText = segments.map((s) => s.text).join('')

  // Render truncation markers as a distinct banner
  if (TRUNCATION_RE.test(fullText.trim())) {
    return (
      <div className="my-3 mx-2 flex items-center gap-3 text-xs text-text-secondary select-none">
        <div className="flex-1 h-px bg-border" />
        <span className="px-3 py-1 rounded-full bg-surface-raised border border-border text-text-secondary/80">
          {fullText.trim()}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
    )
  }

  const nodes: React.ReactNode[] = []
  let nodeKey = 0
  let charOffset = 0
  const lineLinks = detectLinks(fullText)

  for (const seg of segments) {
    const segStart = charOffset
    const segEnd = charOffset + seg.text.length
    const style = segmentToStyle(seg.style)

    // Collect links intersecting this segment, with segment-local offsets
    const segLinks: DetectedLink[] = []
    for (const link of lineLinks) {
      if (link.end <= segStart || link.start >= segEnd) continue
      segLinks.push({
        ...link,
        start: Math.max(link.start - segStart, 0),
        end: Math.min(link.end - segStart, seg.text.length),
        href: link.href,
      })
    }

    const rendered = renderSegmentWithLinks(seg.text, style, segLinks, nodeKey)
    nodeKey += rendered.length
    nodes.push(...rendered)
    charOffset = segEnd
  }

  return <>{nodes}</>
}

function HighlightedLineSegments({
  segments,
  highlights,
}: {
  segments: StyledSegment[]
  highlights: HighlightRange[]
}) {
  if (segments.length === 0) {
    return <>{'\u200B'}</>
  }
  return <>{splitSegmentsWithHighlights(segments, highlights)}</>
}

// ── Block sub-components ────────────────────────────────────────────────────

function VirtualizedLines({ lines, blockId }: { lines: StyledSegment[][]; blockId: string }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const searchOpen = useStore((s) => s.searchOpen)
  const searchMatches = useStore((s) => s.searchMatches)
  const searchCurrentIndex = useStore((s) => s.searchCurrentIndex)

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 20,
    measureElement: (el) => el.getBoundingClientRect().height,
  })

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
        className="text-sm leading-relaxed whitespace-pre-wrap break-words font-mono relative"
        style={{ height: totalSize }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const lineSegments = lines[virtualRow.index]
          const highlights = searchOpen
            ? getLineHighlights(blockId, virtualRow.index, searchMatches, searchCurrentIndex, lineSegments)
            : []

          return (
            <div
              key={virtualRow.index}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 right-0"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {highlights.length > 0 ? (
                <HighlightedLineSegments segments={lineSegments} highlights={highlights} />
              ) : (
                <LineSegments segments={lineSegments} />
              )}
            </div>
          )
        })}
      </pre>
    </div>
  )
}

function SimpleLines({ lines, blockId }: { lines: StyledSegment[][]; blockId: string }) {
  const searchOpen = useStore((s) => s.searchOpen)
  const searchMatches = useStore((s) => s.searchMatches)
  const searchCurrentIndex = useStore((s) => s.searchCurrentIndex)

  return (
    <pre className="px-4 text-sm leading-relaxed whitespace-pre-wrap break-words font-mono">
      {lines.map((lineSegments, lineIdx) => {
        const highlights = searchOpen
          ? getLineHighlights(blockId, lineIdx, searchMatches, searchCurrentIndex, lineSegments)
          : []

        return (
          <div key={lineIdx} style={{ minHeight: LINE_HEIGHT }}>
            {highlights.length > 0 ? (
              <HighlightedLineSegments segments={lineSegments} highlights={highlights} />
            ) : (
              <LineSegments segments={lineSegments} />
            )}
          </div>
        )
      })}
    </pre>
  )
}

// ── Copy action button ─────────────────────────────────────────────────────

const COPY_FEEDBACK_MS = 1500

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="relative group/tip">
      {children}
      <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 rounded text-[10px] leading-tight whitespace-nowrap bg-surface-raised border border-border text-text-primary shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50">
        {text}
      </span>
    </span>
  )
}

function CopyButton({
  label,
  tooltip,
  onClick,
}: {
  label: string
  tooltip: string
  onClick: () => Promise<string>
}) {
  const [copied, setCopied] = useState(false)

  const handleClick = useCallback(async () => {
    try {
      await onClick()
      setCopied(true)
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
    } catch {
      // Clipboard write failed silently
    }
  }, [onClick])

  return (
    <Tooltip text={tooltip}>
      <button
        type="button"
        onClick={handleClick}
        className="px-1.5 py-0.5 rounded text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors text-[10px] leading-tight whitespace-nowrap"
      >
        {copied ? 'Copied!' : label}
      </button>
    </Tooltip>
  )
}

function BlockActions({ block }: { block: Block }) {
  const onCopyOutput = useCallback(() => copyBlockOutput(block), [block])
  const onCopyCommand = useCallback(() => copyBlockCommand(block), [block])
  const onCopyMarkdown = useCallback(() => copyBlockAsMarkdown(block), [block])

  return (
    <div className="flex items-center gap-0.5">
      <CopyButton label="Output" tooltip="Copy command output" onClick={onCopyOutput} />
      <CopyButton label="Cmd" tooltip="Copy command text" onClick={onCopyCommand} />
      <CopyButton label="MD" tooltip="Copy as Markdown" onClick={onCopyMarkdown} />
    </div>
  )
}

// ── Preview rendering ──────────────────────────────────────────────────────

function PreviewRenderer({ contentType, text }: { contentType: ContentType; text: string }) {
  switch (contentType) {
    case 'json':
      return <JsonPreview text={text} />
    case 'diff':
      return <DiffPreview text={text} />
    case 'csv':
      return <CsvPreview text={text} delimiter="," />
    case 'tsv':
      return <CsvPreview text={text} delimiter={'\t'} />
    case 'markdown':
      return <MarkdownPreview text={text} />
    case 'table':
      return <TablePreview text={text} />
    case 'sql':
      return <SqlPreview text={text} />
    case 'yaml':
      return <YamlPreview text={text} />
    default:
      return null
  }
}

function PreviewToggle({
  showPreview,
  onToggle,
}: {
  showPreview: boolean
  onToggle: () => void
}) {
  return (
    <Tooltip text={showPreview ? 'Show raw output' : 'Show rich preview'}>
      <button
        type="button"
        onClick={onToggle}
        className={`px-1.5 py-0.5 rounded text-[10px] leading-tight whitespace-nowrap transition-colors ${
          showPreview
            ? 'bg-accent/20 text-accent'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }`}
      >
        {showPreview ? 'Raw' : 'Preview'}
      </button>
    </Tooltip>
  )
}

// ── Main BlockComponent ─────────────────────────────────────────────────────

export const BlockComponent = memo(function BlockComponent({ block }: { block: Block }) {
  const { color: statusColor, icon: statusIcon } = STATUS_DISPLAY[block.status]
  const config = useStore((s) => s.config)
  const previewsEnabled = config?.appearance?.previews ?? true
  const [showPreview, setShowPreview] = useState<boolean | null>(null)

  const contentType = useMemo(() => detectContentType(block.lines, block.command), [block.lines, block.command])

  // Default showPreview to true when content type detected and previews enabled
  const effectiveShowPreview = showPreview ?? (previewsEnabled && contentType !== null)
  const plainText = useMemo(
    () => (effectiveShowPreview && contentType ? getBlockPlainText(block.lines) : ''),
    [effectiveShowPreview, contentType, block.lines],
  )

  const togglePreview = useCallback(() => setShowPreview((p) => !(p ?? (previewsEnabled && contentType !== null))), [previewsEnabled, contentType])

  const useVirtualization = block.lines.length > VIRTUALIZE_THRESHOLD

  return (
    <div className="group border-b border-border py-3" data-block-id={block.id}>
      {/* Block header */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-1 text-xs">
        <span className={statusColor}>{statusIcon}</span>
        <span className="font-mono font-semibold text-text-primary truncate min-w-0 text-sm">
          {block.command || '…'}
        </span>
        <span className="ml-auto shrink-0" />
        {/* Action buttons + preview toggle — visible on hover */}
        <span className="opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
          <BlockActions block={block} />
          {contentType && (
            <PreviewToggle showPreview={effectiveShowPreview} onToggle={togglePreview} />
          )}
        </span>
        {block.timestamp > 0 && (
          <RelativeTimestamp timestamp={block.timestamp} />
        )}
        {block.duration !== undefined && (
          <span className="text-text-secondary shrink-0">
            {block.duration < 1
              ? `${Math.round(block.duration * 1000)}ms`
              : `${block.duration.toFixed(1)}s`}
          </span>
        )}
      </div>

      {/* Block output */}
      {block.lines.length > 0 && (
        effectiveShowPreview && contentType ? (
          <PreviewRenderer contentType={contentType} text={plainText} />
        ) : useVirtualization ? (
          <VirtualizedLines lines={block.lines} blockId={block.id} />
        ) : (
          <SimpleLines lines={block.lines} blockId={block.id} />
        )
      )}
    </div>
  )
})
