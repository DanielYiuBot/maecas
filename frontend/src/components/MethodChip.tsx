import { HelpCircle } from 'lucide-react'
import type { PanelKey } from '../types/api'
import { useMethodology } from '../context/MethodologyContext'

interface Props {
  panel: PanelKey
  scoreOrBucket?: string
  label?: string
  className?: string
}

/** Inline "(i) Method" affordance that opens the context-aware
 * MethodologyDrawer at the matching MethodologyEntry.
 *
 * Replaces the previous in-place `MethodologyTip` tooltip pattern. By moving
 * methodology to a single drawer, the dashboard surface keeps only the
 * verdict and the verifiable bullets, and audit info lives in one place. */
export function MethodChip({ panel, scoreOrBucket, label = 'Method', className = '' }: Props) {
  const { open } = useMethodology()
  return (
    <button
      type="button"
      onClick={() => open({ panel, scoreOrBucket })}
      className={`inline-flex items-center gap-1 rounded border border-border bg-surface-card px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted transition hover:border-accent-500 hover:text-accent-700 ${className}`}
      aria-label={`Open methodology for ${scoreOrBucket ?? panel}`}
    >
      <HelpCircle className="h-3 w-3" />
      {label}
    </button>
  )
}
