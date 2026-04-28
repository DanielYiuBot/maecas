import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import type { Catalyst, GuidanceCatalysts, ImpactMagnitude } from '../types/api'
import { CitationButton } from './CitationButton'
import { MethodChip } from './MethodChip'

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
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${IMPACT_PILL[value]}`}
      title="LLM impact bucket: qualitative estimate of how much this catalyst would matter to the thesis."
    >
      <span className="opacity-70">Impact</span>
      <span>{value}</span>
    </span>
  )
}

function CatalystRow({ catalyst }: { catalyst: Catalyst }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex items-start gap-4 pl-4">
      <div className="mt-1.5 -ml-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-accent-500 bg-surface-card" />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <span className="rounded border border-accent-100 bg-accent-50 px-2 py-0.5 text-xs text-accent-700">
            {catalyst.timeline}
          </span>
        </div>
        <p className="text-sm text-text-primary">{catalyst.description}</p>
        <p className="mt-0.5 text-xs text-text-secondary">Magnitude: {catalyst.magnitude_est}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ImpactPill value={catalyst.expected_impact_magnitude} />
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

/**
 * Guidance panel — explicit guidance + catalysts.
 *
 * Renamed from `CatalystTimeline`. The panel stays focused on timeline
 * catalysts, invalidation triggers, and supporting citations. */
export function GuidancePanel({ guidance }: Props) {
  const catalysts = guidance.catalysts

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Forward View</p>
          <h3 className="maecas-title">Catalysts &amp; Guidance</h3>
          <p className="maecas-subtitle mt-0.5">
            Each catalyst shows qualitative impact and what would falsify it.
          </p>
        </div>
        <MethodChip panel="guidance" scoreOrBucket="Catalyst evidence trail" />
      </div>

      {catalysts.length > 0 ? (
        <div className="relative">
          <div className="absolute bottom-0 left-4 top-0 w-px bg-border" />
          <div className="space-y-5">
            {catalysts.map((c, i) => (
              <CatalystRow key={i} catalyst={c} />
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded border border-border bg-surface-muted/60 px-3 py-2 text-sm text-text-muted">
          No explicit catalysts were extracted for this run.
        </p>
      )}

      {guidance.implicit_signals.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-2 text-sm font-medium text-text-secondary">Implicit signals</h4>
          <div className="flex flex-wrap gap-2">
            {guidance.implicit_signals.map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded border border-info-100 bg-info-100 px-2 py-1 text-xs text-info-900"
                title="Investment-relevant theme inferred from transcript language; not formal guidance."
              >
                {s.topic} <span className="text-info-900/60">({s.claim_type})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
