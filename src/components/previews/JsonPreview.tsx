import { memo, useCallback, useMemo, useState } from 'react'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import 'highlight.js/styles/github-dark.css'

hljs.registerLanguage('json', json)

interface JsonNodeProps {
  data: unknown
  depth: number
  keyName?: string
}

function JsonNode({ data, depth, keyName }: JsonNodeProps) {
  const [collapsed, setCollapsed] = useState(depth > 2)

  const toggle = useCallback(() => setCollapsed((c) => !c), [])

  const indent = depth * 16

  if (data === null) {
    return (
      <div style={{ paddingLeft: indent }}>
        {keyName !== undefined && <span className="text-[#7ee787]">"{keyName}"</span>}
        {keyName !== undefined && <span className="text-text-secondary">: </span>}
        <span className="text-[#8888A0]">null</span>
      </div>
    )
  }

  if (typeof data === 'boolean') {
    return (
      <div style={{ paddingLeft: indent }}>
        {keyName !== undefined && <span className="text-[#7ee787]">"{keyName}"</span>}
        {keyName !== undefined && <span className="text-text-secondary">: </span>}
        <span className="text-[#ff7b72]">{String(data)}</span>
      </div>
    )
  }

  if (typeof data === 'number') {
    return (
      <div style={{ paddingLeft: indent }}>
        {keyName !== undefined && <span className="text-[#7ee787]">"{keyName}"</span>}
        {keyName !== undefined && <span className="text-text-secondary">: </span>}
        <span className="text-[#79c0ff]">{String(data)}</span>
      </div>
    )
  }

  if (typeof data === 'string') {
    return (
      <div style={{ paddingLeft: indent }}>
        {keyName !== undefined && <span className="text-[#7ee787]">"{keyName}"</span>}
        {keyName !== undefined && <span className="text-text-secondary">: </span>}
        <span className="text-[#a5d6ff]">"{data}"</span>
      </div>
    )
  }

  if (Array.isArray(data)) {
    const count = data.length
    return (
      <div>
        <div
          style={{ paddingLeft: indent }}
          className="cursor-pointer hover:bg-surface-raised/50"
          onClick={toggle}
        >
          <span className="text-text-secondary select-none mr-1">{collapsed ? '\u25b6' : '\u25bc'}</span>
          {keyName !== undefined && <span className="text-[#7ee787]">"{keyName}"</span>}
          {keyName !== undefined && <span className="text-text-secondary">: </span>}
          {collapsed ? (
            <span className="text-text-secondary">
              {'['} <span className="text-[#8888A0] text-xs">{count} items</span> {']'}
            </span>
          ) : (
            <span className="text-text-secondary">{'['}</span>
          )}
        </div>
        {!collapsed && (
          <>
            {data.map((item, i) => (
              <JsonNode key={i} data={item} depth={depth + 1} />
            ))}
            <div style={{ paddingLeft: indent }} className="text-text-secondary">{']'}</div>
          </>
        )}
      </div>
    )
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    const count = entries.length
    return (
      <div>
        <div
          style={{ paddingLeft: indent }}
          className="cursor-pointer hover:bg-surface-raised/50"
          onClick={toggle}
        >
          <span className="text-text-secondary select-none mr-1">{collapsed ? '\u25b6' : '\u25bc'}</span>
          {keyName !== undefined && <span className="text-[#7ee787]">"{keyName}"</span>}
          {keyName !== undefined && <span className="text-text-secondary">: </span>}
          {collapsed ? (
            <span className="text-text-secondary">
              {'{'} <span className="text-[#8888A0] text-xs">{count} keys</span> {'}'}
            </span>
          ) : (
            <span className="text-text-secondary">{'{'}</span>
          )}
        </div>
        {!collapsed && (
          <>
            {entries.map(([key, value]) => (
              <JsonNode key={key} data={value} depth={depth + 1} keyName={key} />
            ))}
            <div style={{ paddingLeft: indent }} className="text-text-secondary">{'}'}</div>
          </>
        )}
      </div>
    )
  }

  return null
}

/**
 * Highlighted raw JSON view as a fallback / simple mode.
 */
function HighlightedJson({ text }: { text: string }) {
  const html = useMemo(() => {
    try {
      return hljs.highlight(text, { language: 'json' }).value
    } catch {
      return escapeHtml(text)
    }
  }, [text])

  return (
    <pre
      className="text-sm leading-relaxed whitespace-pre-wrap break-all font-mono hljs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const JsonPreview = memo(function JsonPreview({ text }: { text: string }) {
  const [viewMode, setViewMode] = useState<'tree' | 'highlighted'>('tree')

  const parsed = useMemo(() => {
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  }, [text])

  if (parsed === undefined) {
    return <HighlightedJson text={text} />
  }

  return (
    <div className="px-4">
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => setViewMode('tree')}
          className={`px-1.5 py-0.5 rounded text-[10px] leading-tight ${
            viewMode === 'tree'
              ? 'bg-accent/20 text-accent'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Tree
        </button>
        <button
          type="button"
          onClick={() => setViewMode('highlighted')}
          className={`px-1.5 py-0.5 rounded text-[10px] leading-tight ${
            viewMode === 'highlighted'
              ? 'bg-accent/20 text-accent'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Highlighted
        </button>
      </div>
      {viewMode === 'tree' ? (
        <div className="text-sm font-mono leading-relaxed overflow-x-auto">
          <JsonNode data={parsed} depth={0} />
        </div>
      ) : (
        <HighlightedJson text={text} />
      )}
    </div>
  )
})
