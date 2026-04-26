import { BarChart3, Info } from 'lucide-react'
import type { CoreThesis, ThesisMemory, ThesisOutcome } from '../types/api'

interface Props {
  memory: ThesisMemory | null
  currentThesis: CoreThesis | null
}

const OUTCOME_LABEL: Record<ThesisOutcome, string> = {
  confirmed: 'Confirmed',
  falsified: 'Falsified',
  open: 'Open',
  unknown: 'Unknown',
}

const OUTCOME_CLASS: Record<ThesisOutcome, string> = {
  confirmed: 'border-bull-100 bg-bull-50 text-bull-900',
  falsified: 'border-bear-100 bg-bear-50 text-bear-900',
  open: 'border-warn-100 bg-warn-50 text-warn-900',
  unknown: 'border-ink-200 bg-ink-100 text-text-secondary',
}

function fmtReturn(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Unavailable'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text-primary">{value}</p>
    </div>
  )
}

export function TrackRecordPanel({ memory, currentThesis }: Props) {
  const summary = memory?.track_record
  if (!summary && !memory) return null

  const statusCopy =
    summary?.status === 'available'
      ? 'Prior MAECAS calls with stored post-call windows.'
      : summary?.status === 'insufficient_history'
        ? 'History exists, but sample size is still too thin to calibrate conviction.'
        : 'Track record unavailable until prior calls have stored post-call windows.'

  const latestComparable = memory?.prior_theses.find((p) => p.decision === currentThesis?.decision)
  const outcome = latestComparable?.thesis_outcome ?? 'unknown'

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Evidence of Trust</p>
          <h3 className="maecas-title">MAECAS Track Record</h3>
          <p className="maecas-subtitle mt-0.5">{statusCopy}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${OUTCOME_CLASS[outcome]}`}>
          {OUTCOME_LABEL[outcome]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Prior calls" value={summary?.prior_call_count ?? memory?.prior_theses.length ?? 0} />
        <Stat label="Confirmed / falsified" value={`${summary?.confirmed_count ?? 0} / ${summary?.falsified_count ?? 0}`} />
        <Stat label="Open / unknown" value={`${summary?.open_count ?? 0} / ${summary?.unknown_count ?? 0}`} />
        <Stat
          label={`Avg ${summary?.return_window ?? 'post-call'} return`}
          value={fmtReturn(summary?.avg_post_earnings_return_pct)}
        />
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-info-100 bg-info-100/40 p-3 text-xs text-info-900">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          {summary?.rationale || 'No prior track-record summary is available for this ticker yet.'}
          {currentThesis && ' Current conviction should be read as a thesis-strength label, not a calibrated hit-rate.'}
        </p>
      </div>
    </div>
  )
}
