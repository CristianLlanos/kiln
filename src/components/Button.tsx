import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost'
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const base = 'px-4 py-2 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-accent hover:bg-accent/80 text-white',
    ghost: 'bg-surface-raised hover:bg-surface-raised/80 text-text-secondary border border-border',
  }
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}
