import { memo, useMemo } from 'react'
import hljs from 'highlight.js/lib/core'
import sql from 'highlight.js/lib/languages/sql'
import 'highlight.js/styles/github-dark.css'

hljs.registerLanguage('sql', sql)

export const SqlPreview = memo(function SqlPreview({ text }: { text: string }) {
  const html = useMemo(() => {
    try {
      return hljs.highlight(text, { language: 'sql' }).value
    } catch {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
  }, [text])

  return (
    <pre
      className="px-4 text-sm leading-relaxed whitespace-pre-wrap break-all font-mono hljs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
