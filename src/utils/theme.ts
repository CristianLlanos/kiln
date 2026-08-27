import type { KilnTheme } from '../store/types'

function hexLuminance(hex: string): number {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16) / 255
  const g = parseInt(c.substring(2, 4), 16) / 255
  const b = parseInt(c.substring(4, 6), 16) / 255
  const toLinear = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export function applyThemeColors(theme: KilnTheme) {
  const root = document.getElementById('root')
  if (!root) return

  const { colors } = theme
  root.style.setProperty('--color-bg', colors.background)
  root.style.setProperty('--color-surface', colors.surface)
  root.style.setProperty('--color-surface-raised', colors.surface_raised)
  root.style.setProperty('--color-border', colors.border)
  root.style.setProperty('--color-text-primary', colors.text_primary)
  root.style.setProperty('--color-text-secondary', colors.text_secondary)
  root.style.setProperty('--color-accent', colors.accent_primary)
  root.style.setProperty('--color-accent-secondary', colors.accent_secondary)
  root.style.setProperty('--color-error', colors.error)
  root.style.setProperty('--color-success', colors.success)
  root.style.setProperty('--color-warning', colors.warning)

  const lum = hexLuminance(colors.background)
  root.setAttribute('data-theme', lum > 0.5 ? 'light' : 'dark')
}
