import { useState } from 'react'
import { ChevronDown, ChevronUp, Clock, Coins, TrendingDown, TrendingUp } from 'lucide-react'
import type { PricedInAssessment, Signal, TradingSignals } from '../types/api'
import { CitationButton } from './CitationButton'
import { ConfidenceBadge, shouldSurfaceConfidence } from '../lib/confidence'
import { useDedup } from '../lib/dedup'
import { MethodologyTip } from './MethodologyTip'

interface Props {
  signals: TradingSignals
}

const PRICED_IN_STYLES: Record<PricedInAssessment, { label: string; className: string }> = {
  priced_in: { label: 'Priced in', className: 'bg-bull-50 text-bull-900 border-bull-100' },
  partially_priced: { label: 'Partially priced', className: 'bg-warn-50 text-warn-900 border-warn-100' },
  not_priced: { label: 'Not priced', className: 'bg-bear-50 text-bear-900 border-bear-100' },
  unknown: { label: 'Priced-in unknown', className: 'bg-ink-100 text-text-secondary border-ink-200' },
}

const PNL_LINKAGE_LABELS: Record<Signal['pnl_linkage'], string> = {
  revenue: 'Revenue',
  margin: 'Margin',
  multiple: 'Multiple',
  capex: 'Capex',
  mix: 'Mix',
}

function PricedInChip({ value }: { value: PricedInAssessment }) {
  const meta = PRICED_IN_STYLES[value]
  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>
      {meta.label}
    </span>
  )
}

function HorizonChip({ value }: { value: Signal['time_horizon'] }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-ink-100 px-2 py-0.5 text-[11px] text-text-secondary">
      <Clock className="h-3 w-3" />
      {value}
    </span>
  )
}

function PnlChip({ value }: { value: Signal['pnl_linkage'] }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-accent-50 px-2 py-0.5 text-[11px] text-accent-700">
      <Coins className="h-3 w-3" />
      {PNL_LINKAGE_LABELS[value]}
    </span>
  )
}

function SignalItem({ signal, type }: { signal: Signal; type: 'bull' | 'bear' }) {
  const [expanded, setExpanded] = useState(signal.priority_tier === 'primary')
  const isBull = type === 'bull'
  const isPrimary = signal.priority_tier === 'primary'

  return (
    <div
      className={`rounded-lg border p-3 ${
        isBull ? 'border-bull-100 bg-bull-50/30' : 'border-bear-100 bg-bear-50/25'
      } ${isPrimary ? 'ring-1 ring-accent-500' : ''}`}
    >
      <div className="flex items-start gap-2">
        {isBull ? (
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-bull-700" />
        ) : (
          <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-bear-700" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-text-primary">{signal.description}</p>
          {signal.so_what && (
            <p className="mt-0.5 text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">So what:</span> {signal.so_what}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded bg-ink-100 px-2 py-0.5 text-text-secondary">{signal.claim_type}</span>
            <span className="rounded bg-accent-50 px-2 py-0.5 text-accent-700">{signal.novelty_status}</span>
            <PricedInChip value={signal.priced_in_assessment} />
            <HorizonChip value={signal.time_horizon} />
            <PnlChip value={signal.pnl_linkage} />
            {signal.numeric_anchor && (
              <span className="rounded bg-bull-50 px-2 py-0.5 font-mono text-bull-700">{signal.numeric_anchor}</span>
            )}
          </div>
          {shouldSurfaceConfidence(signal.confidence) && (
            <div className="mt-1.5 flex items-center gap-2">
              <ConfidenceBadge value={signal.confidence} />
            </div>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-text-muted transition hover:text-text-primary"
          aria-label={expanded ? 'Collapse signal' : 'Expand signal'}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 space-y-2 pl-6">
          <p className="text-xs text-text-secondary">Evidence note: {signal.confidence_rationale}</p>
          {signal.risk_tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {signal.risk_tags.map((t) => (
                <span key={t} className="rounded bg-warn-50 px-1.5 py-0.5 text-[10px] font-medium text-warn-900">
                  {t}
                </span>
              ))}
            </div>
          )}
          {signal.evidence_citations.length > 0 && (
            <div className="space-y-1.5">
              {signal.evidence_citations.map((c, i) => (
                <CitationButton key={i} citation={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface TierSectionProps {
  tier: 'primary' | 'secondary' | 'noise'
  bull: Signal[]
  bear: Signal[]
  defaultCollapsed?: boolean
  hideIfEmpty?: boolean
}

function TierSection({ tier, bull, bear, defaultCollapsed, hideIfEmpty }: TierSectionProps) {
  const [open, setOpen] = useState(!defaultCollapsed)
  const total = bull.length + bear.length
  if (hideIfEmpty && total === 0) return null

  const labelMap = {
    primary: { title: 'Primary signals', desc: 'The 2-3 arguments actually driving the decision.' },
    secondary: { title: 'Secondary signals', desc: 'Real but supporting context.' },
    noise: { title: 'Noise / context', desc: 'Factually true but not decision-relevant.' },
  }
  const meta = labelMap[tier]

  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-surface-muted"
      >
        <div>
          <p className="text-sm font-semibold text-text-primary">
            {meta.title}
            <span className="ml-2 text-xs font-normal text-text-muted">({total})</span>
          </p>
          <p className="text-[11px] text-text-muted">{meta.desc}</p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        )}
      </button>
      {open && (
        <div className="border-t border-border p-3">
          {total === 0 && (
            <p className="text-sm text-text-muted">None at this tier.</p>
          )}
          {total > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-bull-700">
                  <TrendingUp className="h-3 w-3" /> Bull ({bull.length})
                </h4>
                <div className="space-y-2">
                  {bull.map((s) => (
                    <SignalItem key={s.signal_id} signal={s} type="bull" />
                  ))}
                  {bull.length === 0 && <p className="text-xs text-text-muted">None.</p>}
                </div>
              </div>
              <div>
                <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-bear-700">
                  <TrendingDown className="h-3 w-3" /> Bear ({bear.length})
                </h4>
                <div className="space-y-2">
                  {bear.map((s) => (
                    <SignalItem key={s.signal_id} signal={s} type="bear" />
                  ))}
                  {bear.length === 0 && <p className="text-xs text-text-muted">None.</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function bucketByTier(signals: Signal[]) {
  return {
    primary: signals.filter((s) => s.priority_tier === 'primary'),
    secondary: signals.filter((s) => s.priority_tier === 'secondary'),
    noise: signals.filter((s) => s.priority_tier === 'noise'),
  }
}

export function SignalFeed({ signals }: Props) {
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const dedup = useDedup()

  // Drop the signals already surfaced in CoreThesisHeader as key driver / key risk.
  // ID equality is exact and avoids false matches from text similarity. This is
  // the single highest-impact dedup since these two signals are the most often
  // restated facts in the dashboard.
  const ct = signals.core_thesis
  const suppressedIds = new Set(
    [ct?.key_driver_signal_id, ct?.key_risk_signal_id].filter(Boolean) as string[],
  )
  const filterPrimary = (s: Signal) =>
    !(s.priority_tier === 'primary' && suppressedIds.has(s.signal_id))

  const bull = bucketByTier(signals.bull_signals.filter(filterPrimary))
  const bear = bucketByTier(signals.bear_signals.filter(filterPrimary))

  // Register all rendered primary signals so downstream cards (catalysts,
  // narrative claims) can suppress restating them.
  for (const s of [...bull.primary, ...bear.primary]) {
    dedup.register(s.description, `SignalFeed.primary.${s.signal_id}`)
  }
  const suppressedCount =
    signals.bull_signals.filter((s) => s.priority_tier === 'primary' && suppressedIds.has(s.signal_id)).length +
    signals.bear_signals.filter((s) => s.priority_tier === 'primary' && suppressedIds.has(s.signal_id)).length

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Signals</p>
          <h3 className="maecas-title">Trading Signals</h3>
          <p className="maecas-subtitle mt-0.5">Ranked by decision-relevance. Expand Primary first.</p>
        </div>
        <MethodologyTip width="lg">{signals.signal_methodology.heuristic}</MethodologyTip>
      </div>

      {suppressedCount > 0 && (
        <p className="mb-2 text-[11px] italic text-text-muted">
          Top driver and risk are shown in the Core Thesis above; not repeated here.
        </p>
      )}

      <div className="space-y-3">
        <TierSection tier="primary" bull={bull.primary} bear={bear.primary} />
        <TierSection tier="secondary" bull={bull.secondary} bear={bear.secondary} defaultCollapsed />
        <TierSection tier="noise" bull={bull.noise} bear={bear.noise} defaultCollapsed hideIfEmpty />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface-muted">
        <button
          onClick={() => setReasoningOpen(!reasoningOpen)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-ink-100/40"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Why this signal stack
            <span className="ml-2 text-[10px] font-normal text-text-muted">
              ({signals.reasoning_chain.length} step{signals.reasoning_chain.length === 1 ? '' : 's'})
            </span>
          </p>
          {reasoningOpen ? (
            <ChevronUp className="h-4 w-4 text-text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-text-muted" />
          )}
        </button>
        {reasoningOpen && (
          <div className="border-t border-border p-3">
            {signals.reasoning_chain.length === 0 ? (
              <p className="text-sm text-text-muted">Not available.</p>
            ) : (
              <ol className="list-inside list-decimal space-y-0.5 text-sm text-text-primary">
                {signals.reasoning_chain.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}
            <p className="mt-2 text-xs text-text-secondary">Balance: {signals.balance_assessment}</p>
          </div>
        )}
      </div>
    </div>
  )
}
