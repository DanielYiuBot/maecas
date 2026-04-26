import type { ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'

interface Props {
  /** Human-readable methodology / heuristic text. Rendered inside a hover tooltip. */
  children: ReactNode
  /** Optional short label rendered next to the icon (e.g. "Method"). */
  label?: string
  /** Tooltip width override; default fits ~3-4 lines of text. */
  width?: 'sm' | 'md' | 'lg'
}

const WIDTH_CLASS = {
  sm: 'w-48',
  md: 'w-64',
  lg: 'w-80',
} as const

/**
 * A compact "(i) Method" affordance that hides the long methodology text
 * inside a hover/focus tooltip. The trader's critique called methodology
 * footers "corporate boilerplate that adds visual noise without adding rigor"
 * — putting the text behind an icon keeps the audit trail without polluting
 * the card body.
 */
export function MethodologyTip({ children, label = 'Method', width = 'md' }: Props) {
  return (
    <span className="group relative inline-flex items-center gap-1 text-[11px] text-text-muted">
      <HelpCircle className="h-3 w-3 cursor-help" aria-label={`${label} explanation`} />
      <span className="uppercase tracking-wide opacity-70">{label}</span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-0 top-full z-10 mt-1 hidden ${WIDTH_CLASS[width]} rounded-md border border-border bg-surface-card px-2 py-1.5 text-[11px] leading-snug text-text-secondary shadow-md group-hover:block group-focus-within:block`}
      >
        {children}
      </span>
    </span>
  )
}
