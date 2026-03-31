import { memo, useMemo } from 'react'
import hljs from 'highlight.js/lib/core'
import yaml from 'highlight.js/lib/languages/yaml'
import 'highlight.js/styles/github-dark.css'

hljs.registerLanguage('yaml', yaml)

export const YamlPreview = memo(function YamlPreview({ text }: { text: string }) {
  const html = useMemo(() => {
    try {
      return hljs.highlight(text, { language: 'yaml' }).value
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
