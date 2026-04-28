import { ArrowLeft } from 'lucide-react'
import type { AnalysisReport, CoreThesis } from '../types/api'

interface Props {
  report: AnalysisReport
  onReset: () => void
}

const DECISION_STYLES: Record<CoreThesis['decision'], string> = {
  Buy: 'border border-bull-100 bg-bull-50 text-bull-900',
  Monitor: 'border border-warn-100 bg-warn-50 text-warn-900',
  Avoid: 'border border-bear-100 bg-bear-50 text-bear-900',
}

function fmtSurprise(v: number | null | undefined): string | null {
  if (v == null || Number.isNaN(v)) return null
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

/**
 * Sticky decision strip rendered in place of the old header pill.
 * Keeps the verdict and the objective LSEG surprise badge visible while the
 * user scrolls — the user never has to scroll back up to remember either. */
export function DecisionStrip({ report, onReset }: Props) {
  const { metadata, signals, lseg_data } = report
  const decision = signals.core_thesis?.decision
  const eventDate = metadata.event_date.split('T')[0] ?? metadata.event_date

  const epsSurprise = fmtSurprise(lseg_data?.estimates_surprise_fy0?.eps?.surprise_pct)
  const revSurprise = fmtSurprise(lseg_data?.estimates_surprise_fy0?.revenue?.surprise_pct)

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bone-50/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            className="rounded-md border border-border px-2 py-1 text-text-muted transition hover:bg-surface-muted hover:text-text-primary"
            aria-label="Reset analysis"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">MAECAS</h1>
            <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Earnings Intelligence Console</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-border bg-surface-card px-3 py-1 text-text-secondary">
            <span className="font-medium text-text-primary">{metadata.company_name}</span>
            <span className="text-text-muted"> ({metadata.company_ticker}) · {eventDate}</span>
          </span>

          {decision && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${DECISION_STYLES[decision]}`}
              title="Decision derived by the alpha agent from the primary bull/bear signals."
            >
              {decision}
            </span>
          )}

          {(epsSurprise || revSurprise) && (
            <span
              className="rounded-full border border-info-100 bg-info-100 px-3 py-1 text-info-900"
              title="LSEG estimates_surprise_fy0 vs mean estimate. Source: LSEG (objective)."
            >
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">LSEG</span>
              {revSurprise && <span className="font-semibold">Rev {revSurprise}</span>}
              {epsSurprise && revSurprise && <span className="text-info-900/60"> · </span>}
              {epsSurprise && <span className="font-semibold">EPS {epsSurprise}</span>}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
