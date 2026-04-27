import { useState } from 'react'
import { ChevronDown, ChevronUp, Clock, Coins, TrendingDown, TrendingUp } from 'lucide-react'
import type { PricedInAssessment, Signal, TradingSignals } from '../types/api'
import { CitationButton } from './CitationButton'
import { ConfidenceBadge, shouldSurfaceConfidence } from '../lib/confidence'
import { useDedup } from '../lib/dedup'
import { MethodologyTip } from './MethodologyTip'
import { ExplainableBadge } from './ExplainableBadge'

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

const CLAIM_EXPLANATIONS: Record<Signal['claim_type'], string> = {
  fact: 'Grounding label: directly stated or numerically supported in the transcript.',
  inference: 'Grounding label: LLM reasoning based on cited evidence, but not explicitly stated word-for-word.',
  speculation: 'Grounding label: forward-looking interpretation with weaker direct support. Treat as lower certainty.',
}

const NOVELTY_EXPLANATIONS: Record<Signal['novelty_status'], string> = {
  new: 'QoQ label: this signal is newly prominent versus the prior transcript window.',
  repeated: 'QoQ label: this signal appeared before and remains relevant in the current call.',
  de_emphasized: 'QoQ label: this topic was less emphasized in the current call than in prior calls.',
  resolved: 'QoQ label: management indicated the prior issue is now largely closed or less material.',
}

const PRICED_EXPLANATIONS: Record<PricedInAssessment, string> = {
  priced_in: 'LLM market-read label: evidence suggests consensus or price action already reflects this signal.',
  partially_priced: 'LLM market-read label: the market likely recognizes the theme, but not its full magnitude or timing.',
  not_priced: 'LLM market-read label: the signal appears under-modeled relative to consensus/market context.',
  unknown: 'Market-read label: not enough LSEG or expectation context to judge whether the signal is priced in.',
}

const HORIZON_EXPLANATIONS: Record<Signal['time_horizon'], string> = {
  '0-3m': 'Expected time window for this signal to matter or be tested: near-term, within roughly one quarter.',
  '3-6m': 'Expected time window for this signal to matter or be tested: one to two quarters.',
  '6-12m': 'Expected time window for this signal to matter or be tested: medium-term, usually tied to guidance or catalysts.',
  '12m+': 'Expected time window for this signal to matter or be tested: long-term or structural thesis.',
}

const PNL_EXPLANATIONS: Record<Signal['pnl_linkage'], string> = {
  revenue: 'P&L linkage: this signal mainly affects sales or bookings.',
  margin: 'P&L linkage: this signal mainly affects gross margin, operating margin, or cost leverage.',
  multiple: 'P&L linkage: this signal mainly affects valuation multiple or investor narrative.',
  capex: 'P&L linkage: this signal mainly affects investment intensity or capital needs.',
  mix: 'P&L linkage: this signal affects several financial lines rather than one clean driver.',
}

function PricedInChip({ value }: { value: PricedInAssessment }) {
  const meta = PRICED_IN_STYLES[value]
  return (
    <ExplainableBadge className={meta.className} explanation={PRICED_EXPLANATIONS[value]}>
      {meta.label}
    </ExplainableBadge>
  )
}

function HorizonChip({ value }: { value: Signal['time_horizon'] }) {
  return (
    <ExplainableBadge
      className="inline-flex items-center gap-0.5 border-ink-200 bg-ink-100 text-text-secondary"
      explanation={HORIZON_EXPLANATIONS[value]}
    >
      <Clock className="h-3 w-3" />
      {value}
    </ExplainableBadge>
  )
}

function PnlChip({ value }: { value: Signal['pnl_linkage'] }) {
  return (
    <ExplainableBadge
      className="inline-flex items-center gap-0.5 border-accent-100 bg-accent-50 text-accent-700"
      explanation={PNL_EXPLANATIONS[value]}
    >
      <Coins className="h-3 w-3" />
      {PNL_LINKAGE_LABELS[value]}
    </ExplainableBadge>
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
            <ExplainableBadge
              className="border-ink-200 bg-ink-100 text-text-secondary"
              explanation={CLAIM_EXPLANATIONS[signal.claim_type]}
            >
              {signal.claim_type}
            </ExplainableBadge>
            <ExplainableBadge
              className="border-accent-100 bg-accent-50 text-accent-700"
              explanation={NOVELTY_EXPLANATIONS[signal.novelty_status]}
            >
              {signal.novelty_status}
            </ExplainableBadge>
            <PricedInChip value={signal.priced_in_assessment} />
            <HorizonChip value={signal.time_horizon} />
            <PnlChip value={signal.pnl_linkage} />
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
          {signal.numeric_anchor && (
            <p className="text-xs text-text-secondary">
              Numeric anchor: <span className="font-mono">{signal.numeric_anchor}</span>
            </p>
          )}
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
