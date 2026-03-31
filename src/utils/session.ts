import type { Session, Block } from '../store/types'

export function getLastBlock(session: Session): Block | undefined {
  return session.blocks[session.blocks.length - 1]
}

export function hasRunningCommand(session: Session): boolean {
  return session.blocks.some((b) => b.status === 'running')
}

export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 5000) return 'just now'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function formatAbsoluteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

export function shortenHomePath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~')
}

export const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent)

export function getTokenAtCursor(input: string, cursorPos: number): { token: string; tokenStart: number } {
  const textBefore = input.substring(0, cursorPos)
  const lastSpace = textBefore.lastIndexOf(' ')
  return { token: textBefore.substring(lastSpace + 1), tokenStart: lastSpace + 1 }
}

export function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return ''
  let prefix = strings[0]
  for (let i = 1; i < strings.length; i++) {
    while (strings[i].indexOf(prefix) !== 0) {
      prefix = prefix.substring(0, prefix.length - 1)
      if (prefix === '') return ''
    }
  }
  return prefix
}
