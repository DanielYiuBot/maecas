import { AlertTriangle, CheckCircle2, Clock, TrendingDown, TrendingUp } from 'lucide-react'
import type { CoreThesis, Signal, TradingSignals } from '../types/api'
import { useDedup } from '../lib/dedup'
import { MethodologyTip } from './MethodologyTip'

interface Props {
  signals: TradingSignals
}

const DECISION_STYLES: Record<CoreThesis['decision'], string> = {
  Buy: 'border border-bull-100 bg-bull-50 text-bull-900',
  Monitor: 'border border-warn-100 bg-warn-50 text-warn-900',
  Avoid: 'border border-bear-100 bg-bear-50 text-bear-900',
}

const CONVICTION_STYLES: Record<CoreThesis['conviction'], string> = {
  High: 'bg-ink-900 text-white',
  Medium: 'bg-ink-500 text-white',
  Low: 'bg-ink-300 text-ink-900',
}

function findSignal(signals: TradingSignals, id: string): Signal | null {
  return (
    signals.bull_signals.find((s) => s.signal_id === id) ??
    signals.bear_signals.find((s) => s.signal_id === id) ??
    null
  )
}

export function CoreThesisHeader({ signals }: Props) {
  const ct = signals.core_thesis
  const dedup = useDedup()

  // Register facts during render so later cards (CatalystTimeline, WhatChangedPanel,
  // SignalFeed primaries) can suppress restating them. CoreThesisHeader is the first
  // analytical card after QuickRead, so it claims the most prominent facts.
  if (ct) {
    dedup.register(ct.one_liner, 'CoreThesisHeader.one_liner')
    dedup.register(ct.bull_case, 'CoreThesisHeader.bull_case')
    dedup.register(ct.bear_case, 'CoreThesisHeader.bear_case')
    for (const f of ct.what_would_change_this) {
      dedup.register(f, 'CoreThesisHeader.falsifier')
    }
  }

  if (!ct) {
    return (
      <div className="maecas-card border-warn-100 bg-warn-50/40">
        <div className="flex items-center gap-2 text-warn-900">
          <AlertTriangle className="h-4 w-4" />
          <p className="text-sm font-medium">
            Core thesis unavailable for this run. Review signals and expectation panels directly.
          </p>
        </div>
      </div>
    )
  }

  const driver = findSignal(signals, ct.key_driver_signal_id)
  const risk = findSignal(signals, ct.key_risk_signal_id)

  if (driver) dedup.register(driver.description, 'CoreThesisHeader.driver')
  if (risk) dedup.register(risk.description, 'CoreThesisHeader.risk')

  return (
    <div className="maecas-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <p className="maecas-eyebrow">Core Thesis</p>
          <h2 className="mt-1 font-display text-2xl leading-snug text-ink-900">
            {ct.one_liner}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-4 py-1.5 text-sm font-semibold ${DECISION_STYLES[ct.decision]}`}>
            {ct.decision}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${CONVICTION_STYLES[ct.conviction]}`}>
            {ct.conviction} conviction
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-text-secondary">
            <Clock className="h-3 w-3" />
            {ct.time_horizon}
          </span>
          <MethodologyTip width="lg">
            Core thesis is assembled after signal ranking. It uses the primary driver/risk IDs from the Trading Signals payload and the falsifiers emitted with the thesis.
          </MethodologyTip>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-bull-100 bg-bull-50/50 p-3">
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-bull-900">
            <TrendingUp className="h-3 w-3" /> Bull case
          </div>
          <p className="text-sm text-text-primary">{ct.bull_case}</p>
          {driver && (
            <p className="mt-2 text-xs text-bull-900">
              <span className="font-semibold">Key driver:</span> {driver.description}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-bear-100 bg-bear-50/40 p-3">
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-bear-900">
            <TrendingDown className="h-3 w-3" /> Bear case
          </div>
          <p className="text-sm text-text-primary">{ct.bear_case}</p>
          {risk && (
            <p className="mt-2 text-xs text-bear-900">
              <span className="font-semibold">Key risk:</span> {risk.description}
            </p>
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
    </div>
  )
}
