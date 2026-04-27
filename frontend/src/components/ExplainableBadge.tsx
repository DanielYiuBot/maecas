import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  explanation: ReactNode
  className?: string
}

export function ExplainableBadge({ children, explanation, className = '' }: Props) {
  return (
    <span
      className={`group relative inline-flex cursor-help items-center rounded border px-2 py-0.5 text-[11px] font-medium ${className}`}
      tabIndex={0}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-72 rounded-md border border-border bg-surface-card px-2 py-1.5 text-[11px] font-normal leading-snug text-text-secondary shadow-md group-hover:block group-focus:block"
      >
        {explanation}
      </span>
    </span>
  )
}
