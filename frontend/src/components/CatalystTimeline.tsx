import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import type { Catalyst, GuidanceCatalysts, ImpactMagnitude } from '../types/api'
import { CitationButton } from './CitationButton'
import { MethodologyTip } from './MethodologyTip'
import { ConfidenceBadge, bucketConfidence, shouldSurfaceConfidence } from '../lib/confidence'
import { OrdinalChip, surpriseGapToOrdinal } from '../lib/ordinal'
import { useDedup } from '../lib/dedup'

interface Props {
  guidance: GuidanceCatalysts
}

const IMPACT_PILL: Record<ImpactMagnitude, string> = {
  low: 'bg-ink-100 text-text-secondary border-ink-200',
  medium: 'bg-warn-50 text-warn-900 border-warn-100',
  high: 'bg-bull-50 text-bull-900 border-bull-100',
}

function ImpactPill({ value }: { value: ImpactMagnitude }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${IMPACT_PILL[value]}`}
      title="Qualitative impact magnitude on the thesis if the catalyst materialises."
    >
      <span className="uppercase tracking-wide opacity-70">Impact</span>
      <span className="capitalize">{value}</span>
    </span>
  )
}

function ProbabilityPill({ value }: { value: number }) {
  // Reuse the same High/Medium/Low palette as ConfidenceBadge so the eye reads
  // probability and confidence the same way. We deliberately drop the EV
  // multiplication that used to appear here — it implied a unit (and a
  // mathematical operation) that the underlying numbers do not actually support.
  const b = bucketConfidence(value)
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${b.className}`}
      title="Qualitative probability bucket; raw model probability hidden to avoid false precision."
    >
      <span className="uppercase tracking-wide opacity-70">Probability</span>
      <span>{b.label}</span>
    </span>
  )
}

function CatalystRow({ catalyst }: { catalyst: Catalyst }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex items-start gap-4 pl-4">
      <div
        className="mt-1.5 -ml-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-accent-500 bg-surface-card"
      />
      <div className="flex-1 min-w-0">
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <span className="rounded bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700">
            {catalyst.timeline}
          </span>
          {shouldSurfaceConfidence(catalyst.confidence) && <ConfidenceBadge value={catalyst.confidence} />}
        </div>
        <p className="text-sm text-text-primary">{catalyst.description}</p>
        <p className="mt-0.5 text-xs text-text-secondary">Magnitude: {catalyst.magnitude_est}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ImpactPill value={catalyst.expected_impact_magnitude} />
          <ProbabilityPill value={catalyst.probability} />
        </div>

        {(catalyst.invalidation_triggers.length > 0 || catalyst.evidence_citations.length > 0) && (
          <button
            onClick={() => setOpen(!open)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-accent-700 transition hover:text-accent-900"
          >
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            What would make this wrong
          </button>
        )}

        {open && (
          <div className="mt-2 space-y-2 rounded-lg border border-bear-100 bg-bear-50/30 p-2.5">
            {catalyst.invalidation_triggers.length > 0 ? (
              <ul className="space-y-1 text-xs text-text-primary">
                {catalyst.invalidation_triggers.map((t, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-bear-700" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-text-muted">No invalidation triggers identified.</p>
            )}
            {catalyst.evidence_citations.length > 0 && (
              <div className="space-y-1 border-t border-bear-100 pt-2">
                {catalyst.evidence_citations.map((c, i) => (
                  <CitationButton key={i} citation={c} compact />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function CatalystTimeline({ guidance }: Props) {
  const dedup = useDedup()

  // Suppress catalysts whose description has already been surfaced by the Core
  // Thesis or the primary Trading Signals tier. These are the same fact paraphrased.
  const visibleCatalysts: typeof guidance.catalysts = []
  let suppressedCount = 0
  for (const c of guidance.catalysts) {
    if (dedup.isShown(c.description)) {
      suppressedCount += 1
      continue
    }
    visibleCatalysts.push(c)
    dedup.register(c.description, 'CatalystTimeline')
  }

  const catalysts = visibleCatalysts

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Forward View</p>
          <h3 className="maecas-title">Catalysts &amp; Guidance</h3>
          <p className="maecas-subtitle mt-0.5">
            Each catalyst shows qualitative impact, probability bucket, and what would falsify it.
          </p>
        </div>
      </div>

      {catalysts.length > 0 && (
        <div className="relative">
          <div className="absolute bottom-0 left-4 top-0 w-px bg-border" />
          <div className="space-y-5">
            {catalysts.map((c, i) => (
              <CatalystRow key={i} catalyst={c} />
            ))}
          </div>
        </div>
      )}

      {suppressedCount > 0 && (
        <p className="mt-3 text-[11px] italic text-text-muted">
          {suppressedCount} catalyst{suppressedCount === 1 ? '' : 's'} hidden — already covered above.
        </p>
      )}

      {guidance.implicit_signals.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-2 text-sm font-medium text-text-secondary">Implicit Signals</h4>
          <div className="flex flex-wrap gap-2">
            {guidance.implicit_signals.map((s, i) => (
              <span key={i} className="rounded bg-info-100 px-2 py-1 text-xs text-info-900">
                {s.topic} ({s.claim_type})
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span>Surprise gap:</span>
        <OrdinalChip result={surpriseGapToOrdinal(guidance.surprise_gap_score)} prefix="Gap" />
        <MethodologyTip>{guidance.surprise_gap_methodology.heuristic}</MethodologyTip>
      </div>
    </div>
  )
}
