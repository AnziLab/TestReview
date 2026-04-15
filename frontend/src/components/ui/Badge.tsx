import React from 'react'
import { cn } from './cn'

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const tones: Record<Tone, string> = {
  primary: 'bg-indigo-50 text-indigo-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-700',
  danger:  'bg-rose-50 text-rose-600',
  info:    'bg-sky-50 text-sky-600',
  neutral: 'bg-slate-100 text-slate-600',
}
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', tones[tone], className)}>{children}</span>
}
