import type { Block } from '../store/types'

/**
 * Extract plain text from all segments in a block's lines.
 */
function extractOutputText(block: Block): string {
  return block.lines
    .map((lineSegments) => lineSegments.map((seg) => seg.text).join(''))
    .join('\n')
}

/**
 * Copy the block's output (all segment text joined) to the clipboard.
 */
export async function copyBlockOutput(block: Block): Promise<string> {
  const text = extractOutputText(block)
  await navigator.clipboard.writeText(text)
  return text
}

/**
 * Copy just the command string to the clipboard.
 */
export async function copyBlockCommand(block: Block): Promise<string> {
  const text = block.command
  await navigator.clipboard.writeText(text)
  return text
}

/**
 * Copy the block as a Markdown-formatted code block to the clipboard.
 */
export async function copyBlockAsMarkdown(block: Block): Promise<string> {
  const output = extractOutputText(block)
  const md = `\`\`\`\n$ ${block.command}\n${output}\n\`\`\``
  await navigator.clipboard.writeText(md)
  return md
}
