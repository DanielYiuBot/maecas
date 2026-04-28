import { AlertTriangle, CheckCircle2, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react'
import type { CoreThesis, Signal, TradingSignals } from '../types/api'
import { useDedup } from '../lib/dedup'
import { MethodChip } from './MethodChip'
import { SourceTag } from './SourceTag'
import { groupBySeverity } from '../lib/riskSeverity'

interface Props {
  signals: TradingSignals
  riskFlags: string[]
}

const DECISION_STYLES: Record<CoreThesis['decision'], string> = {
  Buy: 'border border-bull-100 bg-bull-50 text-bull-900',
  Monitor: 'border border-warn-100 bg-warn-50 text-warn-900',
  Avoid: 'border border-bear-100 bg-bear-50 text-bear-900',
}

function findSignal(signals: TradingSignals, id: string): Signal | null {
  return (
    signals.bull_signals.find((s) => s.signal_id === id) ??
    signals.bear_signals.find((s) => s.signal_id === id) ??
    null
  )
}

/**
 * Decision panel — the "verdict" card.
 *
 * The 2026 revamp pruned this card down to the thesis itself: one-liner,
 * bull case, bear case, key driver / risk, and the "what would change this
 * view" falsifiers. Conviction was removed (LLM self-confidence is not a
 * market signal); the Buy/Monitor/Avoid badge and time horizon now live in
 * the persistent DecisionStrip at the top of the dashboard so the user
 * never has to scroll back up to remember the verdict.
 *
 * High-severity risk flags are surfaced as a small inline footer chip; the
 * full list (including model_warnings) lives in the Methodology drawer.
 */
export function DecisionPanel({ signals, riskFlags }: Props) {
  const ct = signals.core_thesis
  const dedup = useDedup()

  if (ct) {
    dedup.register(ct.one_liner, 'DecisionPanel.one_liner')
    dedup.register(ct.bull_case, 'DecisionPanel.bull_case')
    dedup.register(ct.bear_case, 'DecisionPanel.bear_case')
    for (const f of ct.what_would_change_this) {
      dedup.register(f, 'DecisionPanel.falsifier')
    }
  }

  if (!ct) {
    return (
      <div className="maecas-card border-warn-100 bg-warn-50/40">
        <div className="flex items-center gap-2 text-warn-900">
          <AlertTriangle className="h-4 w-4" />
          <p className="text-sm font-medium">
            Core thesis unavailable for this run. Review Highlight and LSEG panels directly.
          </p>
        </div>
      </div>
    )
  }

  const driver = findSignal(signals, ct.key_driver_signal_id)
  const risk = findSignal(signals, ct.key_risk_signal_id)
  if (driver) dedup.register(driver.description, 'DecisionPanel.driver')
  if (risk) dedup.register(risk.description, 'DecisionPanel.risk')

  const highRisks = groupBySeverity(riskFlags).high

  return (
    <div className="maecas-card">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <p className="maecas-eyebrow">Decision</p>
          <h2 className="mt-1 font-display text-2xl leading-snug text-ink-900">{ct.one_liner}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${DECISION_STYLES[ct.decision]}`}
            title="Decision derived by the alpha agent from the primary bull/bear signals."
          >
            {ct.decision}
          </span>
          <MethodChip panel="decision" scoreOrBucket="Decision" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-bull-100 bg-bull-50/50 p-3">
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-bull-900">
            <TrendingUp className="h-3 w-3" /> Bull case
          </div>
          <p className="text-sm text-text-primary">{ct.bull_case}</p>
          {driver && (
            <div className="mt-2 flex flex-wrap items-start gap-1.5 text-xs text-bull-900">
              <span className="font-semibold">Key driver:</span>
              <SourceTag source={driver.source} />
              <span className="flex-1">{driver.description}</span>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-bear-100 bg-bear-50/40 p-3">
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-bear-900">
            <TrendingDown className="h-3 w-3" /> Bear case
          </div>
          <p className="text-sm text-text-primary">{ct.bear_case}</p>
          {risk && (
            <div className="mt-2 flex flex-wrap items-start gap-1.5 text-xs text-bear-900">
              <span className="font-semibold">Key risk:</span>
              <SourceTag source={risk.source} />
              <span className="flex-1">{risk.description}</span>
            </div>
          )}
        </div>
      </div>

      {ct.what_would_change_this.length > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-surface-muted/60 p-3">
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            <CheckCircle2 className="h-3 w-3" /> What would change this view
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-sm text-text-primary">
            {ct.what_would_change_this.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {highRisks.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-bear-100 bg-bear-50/40 px-3 py-2 text-xs text-bear-900">
          <ShieldAlert className="h-3.5 w-3.5" />
          <span className="font-semibold uppercase tracking-wide">High-severity risk</span>
          <span className="text-text-secondary">·</span>
          <span className="flex-1">{highRisks.map((r) => r.text).join(' · ')}</span>
          <MethodChip panel="decision" scoreOrBucket="Decision" label="More" />
        </div>
      )}
    </div>
  )
}
