import { MinusCircle, PlusCircle } from 'lucide-react'
import type { QoQDelta } from '../types/api'
import { OrdinalChip, deltaToOrdinal } from '../lib/ordinal'
import { MethodologyTip } from './MethodologyTip'

interface Props {
  delta: QoQDelta | null
}

function DriftBadge({
  label,
  value,
  positiveIsBad,
}: {
  label: string
  value: number
  positiveIsBad: boolean
}) {
  const harmful = positiveIsBad ? value > 0.5 : value < -0.5
  const beneficial = positiveIsBad ? value < -0.5 : value > 0.5
  const tone = harmful ? 'text-bear-700' : beneficial ? 'text-bull-700' : 'text-text-muted'
  const sign = value > 0 ? '+' : ''
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${tone}`}>
      <span>{label}:</span>
      <span className="font-mono font-medium">
        {sign}
        {value.toFixed(1)}
      </span>
    </span>
  )
}

export function DeltaView({ delta }: Props) {
  if (!delta) return null

  const topicShifts = delta.topic_deltas
    .map((row) => ({ topic: row.topic, ordinal: deltaToOrdinal(row.sentiment_delta) }))
    .sort((a, b) => {
      const order = { up: 0, down: 1, flat: 2, none: 3 } as const
      return order[a.ordinal.direction] - order[b.ordinal.direction]
    })

  const drift = delta.language_drift

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Comparison</p>
          <h3 className="maecas-title">Quarter-over-Quarter Changes</h3>
        </div>
      </div>

      <div className="mb-6">
        <h4 className="mb-2 text-sm font-medium text-text-secondary">Signal Novelty</h4>
        <div className="flex flex-wrap gap-2">
          {delta.signal_novelty.map((s, i) => (
            <span key={i} className="rounded bg-surface-muted px-2 py-1 text-xs text-text-secondary">
              {s.signal_id}: {s.novelty_status}
            </span>
          ))}
          {delta.signal_novelty.length === 0 && (
            <span className="text-xs text-text-muted">No signals tagged with novelty status.</span>
          )}
        </div>
      </div>

      {topicShifts.length > 0 && (
        <div className="mb-5">
          <h4 className="mb-2 text-sm font-medium text-text-secondary">Tone shifts by topic vs prior quarter</h4>
          <div className="space-y-1.5">
            {topicShifts.map((row) => (
              <div
                key={row.topic}
                className="flex items-center justify-between gap-2 rounded border border-border bg-surface-card px-2 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-text-primary">{row.topic}</span>
                <OrdinalChip result={row.ordinal} size="sm" />
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-text-muted">
            Direction buckets only. Double arrows mark larger moves; centred bucket suppresses moves within model noise floor.
          </p>
        </div>
      )}

      {drift && (drift.added_phrases.length > 0 || drift.removed_phrases.length > 0) && (
        <div className="mb-5 rounded-lg border border-border bg-surface-muted/60 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <h4 className="text-sm font-medium text-text-primary">Language drift</h4>
            <DriftBadge label="Hedging drift" value={drift.hedging_drift} positiveIsBad />
            <DriftBadge label="Certainty drift" value={drift.certainty_drift} positiveIsBad={false} />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-bull-700">
                <PlusCircle className="h-3 w-3" /> Started saying
              </p>
              <div className="flex flex-wrap gap-1.5">
                {drift.added_phrases.slice(0, 12).map((p) => (
                  <span key={p} className="rounded bg-bull-50 px-2 py-0.5 text-xs text-bull-900">
                    {p}
                  </span>
                ))}
                {drift.added_phrases.length === 0 && (
                  <span className="text-xs text-text-muted">No distinctive new phrases.</span>
                )}
              </div>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-bear-700">
                <MinusCircle className="h-3 w-3" /> Stopped saying
              </p>
              <div className="flex flex-wrap gap-1.5">
                {drift.removed_phrases.slice(0, 12).map((p) => (
                  <span key={p} className="rounded bg-bear-50 px-2 py-0.5 text-xs text-bear-900">
                    {p}
                  </span>
                ))}
                {drift.removed_phrases.length === 0 && (
                  <span className="text-xs text-text-muted">No distinctive phrases dropped.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
        <span>
          Guidance specificity delta:{' '}
          {delta.guidance_specificity_delta > 0 ? '+' : ''}
          {delta.guidance_specificity_delta}
        </span>
        <MethodologyTip>{delta.methodology.heuristic}</MethodologyTip>
        {delta.new_risk_keywords.length > 0 && (
          <span className="text-warn-900">
            New risks: {delta.new_risk_keywords.join(', ')}
          </span>
        )}
      </div>
    </div>
  )
}
