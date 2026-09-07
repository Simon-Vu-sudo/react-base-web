import type { ReactNode } from 'react'

type Tone = 'ok' | 'warn' | 'error' | 'neutral'

const TONES: Record<Tone, string> = {
  ok: 'bg-green-100 text-green-800',
  warn: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  neutral: 'bg-slate-100 text-slate-700',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>
  )
}
