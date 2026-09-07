import type { ReactNode } from 'react'

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  )
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-slate-200 px-3 py-2 text-left font-medium text-slate-600">
      {children}
    </th>
  )
}

export function Td({ children }: { children: ReactNode }) {
  return <td className="border-b border-slate-100 px-3 py-2">{children}</td>
}
