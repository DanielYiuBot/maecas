import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Lightbulb,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type {
  AnalysisReport,
  ExpectationBullet,
  ExpectationReality,
  HiddenGem,
  LSEGMarketData,
  PotentialRisk,
  Signal,
  TradingSignals,
} from '../types/api'
import { CitationButton } from './CitationButton'
import { useDedup } from '../lib/dedup'
import { MethodChip } from './MethodChip'
import { SourceTag } from './SourceTag'
import { HorizonChip } from './HorizonChip'

interface Props {
  report: AnalysisReport
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function SurpriseLine({ lseg_data }: { lseg_data: LSEGMarketData | null | undefined }) {
  const eps = lseg_data?.estimates_surprise_fy0?.eps?.surprise_pct
  const rev = lseg_data?.estimates_surprise_fy0?.revenue?.surprise_pct
  if ((eps == null || Number.isNaN(eps)) && (rev == null || Number.isNaN(rev))) return null

  const epsTone =
    eps == null ? 'text-text-muted' : eps > 0 ? 'text-bull-700' : eps < 0 ? 'text-bear-700' : 'text-text-secondary'
  const revTone =
    rev == null ? 'text-text-muted' : rev > 0 ? 'text-bull-700' : rev < 0 ? 'text-bear-700' : 'text-text-secondary'

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-info-100 bg-info-100/50 px-3 py-2 text-xs">
      <SourceTag source="LSEG" lsegKind="surprise" />
      <span className="text-text-primary">
        Quarter outcome vs consensus: <span className={`font-semibold ${revTone}`}>Revenue {fmtPct(rev)}</span>
        <span className="text-text-muted"> · </span>
        <span className={`font-semibold ${epsTone}`}>EPS {fmtPct(eps)}</span>
      </span>
      <MethodChip panel="lseg" scoreOrBucket="Surprise %" />
    </div>
  )
}

function SignalCard({ signal, type }: { signal: Signal; type: 'bull' | 'bear' }) {
  const [expanded, setExpanded] = useState(false)
  const isBull = type === 'bull'

  return (
    <div className={`rounded-lg border p-3 ${isBull ? 'border-bull-100 bg-bull-50/30' : 'border-bear-100 bg-bear-50/25'}`}>
      <div className="flex items-start gap-2">
        {isBull ? (
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-bull-700" />
        ) : (
          <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-bear-700" />
        )}
        <div className="flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <SourceTag source={signal.source} />
            <HorizonChip value={signal.time_horizon} />
          </div>
          <p className="text-sm font-medium text-text-primary">{signal.description}</p>
          {signal.so_what && (
            <p className="mt-1 text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">So what:</span> {signal.so_what}
            </p>
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
          {signal.numeric_anchor && (
            <p className="text-xs text-text-secondary">
              Numeric anchor: <span className="font-mono">{signal.numeric_anchor}</span>
            </p>
          )}
          <p className="text-xs text-text-secondary">{signal.confidence_rationale}</p>
          {signal.evidence_citations.length > 0 && (
            <div className="space-y-1.5">
              {signal.evidence_citations.map((c, i) => (
                <CitationButton key={i} citation={c} compact />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HighlightBullet({ bullet }: { bullet: ExpectationBullet }) {
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-1.5 text-xs text-text-secondary">
        <SourceTag source={bullet.source ?? 'Synthesis'} />
        <span className="flex-1 text-text-primary">{bullet.text}</span>
      </div>
      {bullet.citations.length > 0 && (
        <div className="ml-1 flex flex-wrap gap-1.5">
          {bullet.citations.slice(0, 2).map((c, i) => (
            <CitationButton key={i} citation={c} compact />
          ))}
        </div>
      )}
    </div>
  )
}

function HiddenGemCard({ gem }: { gem: HiddenGem }) {
  return (
    <div className="rounded-lg border border-warn-100 bg-warn-50/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-warn-900">
        <Lightbulb className="h-3 w-3" />
        {gem.mention_count <= 1 ? 'Single-mention thread' : `Under-discussed · ${gem.mention_count} mentions`}
      </div>
      <p className="text-sm font-medium text-text-primary">{gem.statement}</p>
      <p className="mt-1 text-xs text-text-secondary">
        <span className="font-semibold">Why it matters:</span> {gem.why_it_matters}
      </p>
      {gem.citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {gem.citations.slice(0, 2).map((c, i) => (
            <CitationButton key={i} citation={c} compact />
          ))}
        </div>
      )}
    </div>
  )
}

const SEVERITY_STYLE: Record<PotentialRisk['severity'], { chip: string; text: string }> = {
  high: { chip: 'border-bear-100 bg-bear-50 text-bear-900', text: 'High' },
  medium: { chip: 'border-warn-100 bg-warn-50 text-warn-900', text: 'Medium' },
  low: { chip: 'border-ink-200 bg-ink-100 text-text-secondary', text: 'Low' },
}

function PotentialRiskCard({ risk }: { risk: PotentialRisk }) {
  const sev = SEVERITY_STYLE[risk.severity] ?? SEVERITY_STYLE.medium
  return (
    <div className="rounded-lg border border-bear-100 bg-bear-50/25 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-bear-900">
        <ShieldAlert className="h-3 w-3" />
        Potential risk
        <span className={`ml-auto rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${sev.chip}`}>
          {sev.text} severity
        </span>
      </div>
      <p className="text-sm font-medium text-text-primary">{risk.risk}</p>
      {risk.why_it_matters && (
        <p className="mt-1 text-xs text-text-secondary">
          <span className="font-semibold">Why it matters:</span> {risk.why_it_matters}
        </p>
      )}
      {risk.citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {risk.citations.slice(0, 2).map((c, i) => (
            <CitationButton key={i} citation={c} compact />
          ))}
        </div>
      )}
    </div>
  )
}

function pickTopSignals(signals: TradingSignals, suppressedIds: Set<string>) {
  const filterSuppressed = (s: Signal) => !suppressedIds.has(s.signal_id)

  const bullPrimary = signals.bull_signals.filter((s) => s.priority_tier === 'primary' && filterSuppressed(s))
  const bearPrimary = signals.bear_signals.filter((s) => s.priority_tier === 'primary' && filterSuppressed(s))
  const bullSecondary = signals.bull_signals.filter((s) => s.priority_tier === 'secondary' && filterSuppressed(s))
  const bearSecondary = signals.bear_signals.filter((s) => s.priority_tier === 'secondary' && filterSuppressed(s))

  return { bullPrimary, bearPrimary, bullSecondary, bearSecondary }
}

function highlightBullets(expectation: ExpectationReality | null | undefined): ExpectationBullet[] {
  if (!expectation) return []
  return expectation.what_changed_items ?? []
}

/**
 * Summary panel — three sections:
 *   1. Primary signals  (top bull + top bear).
 *   2. Secondary signals (collapsed expander).
 *   3. Highlights — what the call confirmed or contradicted vs LSEG and the
 *      transcript. (Internally still backed by ExpectationReality.what_changed_items;
 *      we just no longer label the section "what changed vs consensus" on
 *      the surface.)
 *
 * Hidden gems and potential risks render as small sub-sections at the bottom
 * so the user can see under-discussed threads and deduced thesis risks
 * without giving them their own panel.
 */
export function SummaryPanel({ report }: Props) {
  const dedup = useDedup()
  const ct = report.signals.core_thesis
  const suppressedIds = new Set([ct?.key_driver_signal_id, ct?.key_risk_signal_id].filter(Boolean) as string[])

  const { bullPrimary, bearPrimary, bullSecondary, bearSecondary } = pickTopSignals(report.signals, suppressedIds)
  const highlights = highlightBullets(report.expectation_reality)
  const gems = report.hidden_gems ?? []
  const risks = report.potential_risks ?? []

  for (const s of [...bullPrimary, ...bearPrimary]) {
    dedup.register(s.description, `SummaryPanel.primary.${s.signal_id}`)
  }

  const [secondaryOpen, setSecondaryOpen] = useState(false)
  const hasSecondary = bullSecondary.length + bearSecondary.length > 0

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Summary</p>
          <h3 className="maecas-title">Primary, secondary, and highlights</h3>
          <p className="maecas-subtitle mt-0.5">
            Top bull and bear signals on top, supporting context below, plus the call's highlights.
          </p>
        </div>
        <MethodChip panel="summary" scoreOrBucket="Top bull / bear signals" />
      </div>

      <SurpriseLine lseg_data={report.lseg_data} />

      <section className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Primary signals</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-bull-700">
              <TrendingUp className="h-3 w-3" /> Bull
            </p>
            {bullPrimary.length > 0 ? (
              <div className="space-y-2">
                {bullPrimary.map((s) => (
                  <SignalCard key={s.signal_id} signal={s} type="bull" />
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                {ct?.key_driver_signal_id ? 'Top driver shown in Decision panel.' : 'No primary bull signals.'}
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-bear-700">
              <TrendingDown className="h-3 w-3" /> Bear
            </p>
            {bearPrimary.length > 0 ? (
              <div className="space-y-2">
                {bearPrimary.map((s) => (
                  <SignalCard key={s.signal_id} signal={s} type="bear" />
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                {ct?.key_risk_signal_id ? 'Key risk shown in Decision panel.' : 'No primary bear signals.'}
              </p>
            )}
          </div>
        </div>
      </section>

      {hasSecondary && (
        <section className="mt-4">
          <div className="rounded-lg border border-border bg-surface-card">
            <button
              onClick={() => setSecondaryOpen(!secondaryOpen)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-surface-muted"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
                Secondary signals
                <span className="ml-2 text-[10px] font-normal text-text-muted">
                  ({bullSecondary.length + bearSecondary.length})
                </span>
              </p>
              {secondaryOpen ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
            </button>
            {secondaryOpen && (
              <div className="grid grid-cols-1 gap-3 border-t border-border p-3 md:grid-cols-2">
                <div className="space-y-2">
                  {bullSecondary.map((s) => (
                    <SignalCard key={s.signal_id} signal={s} type="bull" />
                  ))}
                  {bullSecondary.length === 0 && <p className="text-xs text-text-muted">No supporting bull signals.</p>}
                </div>
                <div className="space-y-2">
                  {bearSecondary.map((s) => (
                    <SignalCard key={s.signal_id} signal={s} type="bear" />
                  ))}
                  {bearSecondary.length === 0 && <p className="text-xs text-text-muted">No supporting bear signals.</p>}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {highlights.length > 0 && (
        <section className="mt-4 rounded-lg border border-border bg-surface-card p-3">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
            <Sparkles className="h-3 w-3" /> Highlights
          </p>
          <div className="space-y-2">
            {highlights.map((b, i) => (
              <HighlightBullet key={`hl-${i}`} bullet={b} />
            ))}
          </div>
        </section>
      )}

      {gems.length > 0 && (
        <section className="mt-4">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
            <Lightbulb className="h-3 w-3" /> Under-discussed threads
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {gems.map((gem, i) => (
              <HiddenGemCard key={`gem-${i}`} gem={gem} />
            ))}
          </div>
        </section>
      )}

      {risks.length > 0 && (
        <section className="mt-4">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
            <ShieldAlert className="h-3 w-3" /> Potential risks
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {risks.map((r, i) => (
              <PotentialRiskCard key={`risk-${i}`} risk={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
