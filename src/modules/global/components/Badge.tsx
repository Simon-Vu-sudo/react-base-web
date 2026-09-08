import type { HTMLAttributes, ReactNode } from 'react'

type Tone = 'ok' | 'warn' | 'error' | 'neutral'

const TONES: Record<Tone, string> = {
  ok: 'bg-green-100 text-green-800',
  warn: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  neutral: 'bg-slate-100 text-slate-700',
}

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone
  children: ReactNode
}

export function Badge({ tone = 'neutral', className = '', children, ...rest }: Props) {
  return (
    // `...rest` is spread first so a caller cannot clobber the tone classes,
    // matching Button and Input. Pass-through attributes matter here because a
    // Badge renders bare text with no role or accessible name of its own, so
    // `data-testid` / `aria-*` is the only way to address a specific one.
    <span
      {...rest}
      className={`rounded px-2 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
