import type { ReactNode } from 'react'

const TONES = {
  error: 'border-red-300 bg-red-50 text-red-800',
  info: 'border-slate-300 bg-slate-50 text-slate-700',
} as const

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: keyof typeof TONES
  children: ReactNode
}) {
  return (
    <div role="alert" className={`rounded border px-3 py-2 text-sm ${TONES[tone]}`}>
      {children}
    </div>
  )
}
