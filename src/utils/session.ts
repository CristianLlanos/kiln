import type { Session, Block } from '../store/types'

export function getLastBlock(session: Session): Block | undefined {
  return session.blocks[session.blocks.length - 1]
}

export function hasRunningCommand(session: Session): boolean {
  return session.blocks.some((b) => b.status === 'running')
}

export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
