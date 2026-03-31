import { memo, useMemo } from 'react'

/**
 * Minimal markdown to HTML converter. Escapes HTML first, then applies
 * markdown transforms. No dangerouslySetInnerHTML with user content.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function markdownToHtml(text: string): string {
  // First escape all HTML
  let html = escapeHtml(text)

  // Code blocks (must be before inline code)
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, _lang: string, code: string) =>
      `<pre class="bg-surface-raised rounded p-3 my-2 text-sm overflow-x-auto"><code>${code.trim()}</code></pre>`,
  )

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="bg-surface-raised rounded px-1 py-0.5 text-sm">$1</code>',
  )

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6 class="text-sm font-semibold mt-3 mb-1 text-text-primary">$1</h6>')
  html = html.replace(/^#####\s+(.+)$/gm, '<h5 class="text-sm font-semibold mt-3 mb-1 text-text-primary">$1</h5>')
  html = html.replace(/^####\s+(.+)$/gm, '<h4 class="text-base font-semibold mt-3 mb-1 text-text-primary">$1</h4>')
  html = html.replace(/^###\s+(.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-1 text-text-primary">$1</h3>')
  html = html.replace(/^##\s+(.+)$/gm, '<h2 class="text-xl font-bold mt-4 mb-2 text-text-primary">$1</h2>')
  html = html.replace(/^#\s+(.+)$/gm, '<h1 class="text-2xl font-bold mt-4 mb-2 text-text-primary">$1</h1>')

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Links (already escaped, so use &amp; aware patterns)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a class="text-accent underline" href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  )

  // Blockquotes
  html = html.replace(
    /^&gt;\s+(.+)$/gm,
    '<blockquote class="border-l-2 border-accent pl-3 my-1 text-text-secondary italic">$1</blockquote>',
  )

  // Unordered lists
  html = html.replace(
    /^[-*]\s+(.+)$/gm,
    '<li class="ml-4 list-disc text-text-primary">$1</li>',
  )

  // Ordered lists
  html = html.replace(
    /^\d+\.\s+(.+)$/gm,
    '<li class="ml-4 list-decimal text-text-primary">$1</li>',
  )

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr class="border-border my-3" />')

  // Paragraphs: wrap remaining lines that aren't already wrapped in block elements
  html = html.replace(
    /^(?!<[huplbao]|<li|<pre|<code|<hr|<block)(.+)$/gm,
    '<p class="my-1">$1</p>',
  )

  return html
}

export const MarkdownPreview = memo(function MarkdownPreview({ text }: { text: string }) {
  const html = useMemo(() => markdownToHtml(text), [text])

  return (
    <div
      className="px-4 text-sm leading-relaxed font-mono markdown-preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
