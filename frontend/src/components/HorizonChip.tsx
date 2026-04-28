import { Clock } from 'lucide-react'
import type { TimeHorizon } from '../types/api'
import { ExplainableBadge } from './ExplainableBadge'
import { horizonToOrdinal } from '../lib/ordinal'

interface Props {
  value: TimeHorizon | null | undefined
}

const HORIZON_DETAIL: Record<'Short' | 'Medium' | 'Long' | 'Unknown', string> = {
  Short: 'short horizon: roughly 0-3 months. signal should resolve in the next quarter.',
  Medium: 'medium horizon: roughly 3-12 months. signal usually tracks against guidance or near-term catalysts.',
  Long: 'long horizon: 12+ months. signal is structural; expect to revisit each quarter rather than play it.',
  Unknown: 'horizon not classified.',
}

/** Compact `Short / Medium / Long` chip used wherever we need to communicate
 * a signal's expected time-to-resolve. Replaces the raw "0-3m" / "12m+"
 * labels on the dashboard surface. */
export function HorizonChip({ value }: Props) {
  const label = horizonToOrdinal(value ?? null)
  return (
    <ExplainableBadge
      className="inline-flex items-center gap-0.5 border-ink-200 bg-ink-100 text-text-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
      explanation={HORIZON_DETAIL[label]}
    >
      <Clock className="h-3 w-3" />
      {label}
    </ExplainableBadge>
  )
}
