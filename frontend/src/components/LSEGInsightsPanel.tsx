import type { ReactNode } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from 'recharts'
import { HelpCircle } from 'lucide-react'
import type {
  AnalysisReport,
  BeatMissFlag,
  ConsensusEstimates,
  EstimatesSurpriseFY0,
  LSEGMarketData,
  MetricSurpriseSnapshot,
  StatedFigure,
} from '../types/api'
import { chartTheme } from '../lib/chartTheme'
import { MethodChip } from './MethodChip'
import { SourceTag } from './SourceTag'

type Props = Pick<AnalysisReport, 'lseg_data' | 'market' | 'metadata' | 'financials'>

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(digits)}T`
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(digits)}K`
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function surpriseHasData(m: MetricSurpriseSnapshot | null | undefined): boolean {
  if (!m) return false
  return (
    m.actual != null ||
    m.mean_estimate != null ||
    m.surprise_pct != null ||
    m.sue_score != null ||
    m.num_estimates != null
  )
}

function InfoTip({ children, label = 'explain' }: { children: ReactNode; label?: string }) {
  return (
    <span className="group relative inline-flex">
      <HelpCircle className="h-3 w-3 cursor-help text-text-muted" aria-label={label} />
      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 hidden w-56 -translate-x-1/2 rounded-md border border-border bg-surface-card px-2 py-1.5 text-[11px] leading-snug text-text-secondary shadow-md group-hover:block">
        {children}
      </span>
    </span>
  )
}

function interpretSue(s: number | null | undefined): string {
  if (s === null || s === undefined || Number.isNaN(s)) return ''
  const abs = Math.abs(s)
  if (abs < 1) return 'in line'
  if (abs < 2) return 'meaningful surprise'
  return 'large surprise'
}

interface MergedRow {
  metric: string
  actual: number | null
  consensus: number | null
  surprisePct: number | null
  sue: number | null
  numEst: number | null
  reportDate: string | null
  direction: string | null
  numericFidelity: 'lseg' | 'transcript_vs_lseg'
}

function mergeRows(
  est: EstimatesSurpriseFY0 | null | undefined,
  consensus: ConsensusEstimates | null | undefined,
  beatMissFlags: BeatMissFlag[],
): MergedRow[] {
  const rows: MergedRow[] = []
  const seen = new Set<string>()

  // Anchor on LSEG-reported actuals (estimates_surprise_fy0) for EPS/Revenue.
  if (est?.eps && surpriseHasData(est.eps)) {
    rows.push({
      metric: 'EPS',
      actual: est.eps.actual ?? null,
      consensus: est.eps.mean_estimate ?? consensus?.eps_mean ?? null,
      surprisePct: est.eps.surprise_pct ?? null,
      sue: est.eps.sue_score ?? null,
      numEst: est.eps.num_estimates ?? null,
      reportDate: est.eps.act_report_date ?? null,
      direction: null,
      numericFidelity: 'lseg',
    })
    seen.add('eps')
  }
  if (est?.revenue && surpriseHasData(est.revenue)) {
    rows.push({
      metric: 'Revenue',
      actual: est.revenue.actual ?? null,
      consensus: est.revenue.mean_estimate ?? consensus?.revenue_mean ?? null,
      surprisePct: est.revenue.surprise_pct ?? null,
      sue: est.revenue.sue_score ?? null,
      numEst: est.revenue.num_estimates ?? null,
      reportDate: est.revenue.act_report_date ?? null,
      direction: null,
      numericFidelity: 'lseg',
    })
    seen.add('revenue')
  }

  // EBITDA only appears in consensus (no event-aligned actual). Add a row when we have a consensus mean.
  if (consensus?.ebitda_mean != null && !seen.has('ebitda')) {
    rows.push({
      metric: 'EBITDA',
      actual: null,
      consensus: consensus.ebitda_mean,
      surprisePct: null,
      sue: null,
      numEst: null,
      reportDate: null,
      direction: null,
      numericFidelity: 'lseg',
    })
    seen.add('ebitda')
  }

  // Anything else from beat_miss_flags (e.g. Net Bookings, FY guidance) that
  // doesn't already have an LSEG-anchored row above.
  for (const f of beatMissFlags) {
    const key = (f.metric || '').trim().toLowerCase()
    if (!key) continue
    if (key.includes('eps') && seen.has('eps')) continue
    if ((key.includes('revenue') || key.includes('sales')) && seen.has('revenue')) continue
    if (key.includes('ebitda') && seen.has('ebitda')) continue
    rows.push({
      metric: f.metric,
      actual: f.stated_value ?? null,
      consensus: f.consensus_value ?? null,
      surprisePct: f.surprise_pct ?? null,
      sue: null,
      numEst: null,
      reportDate: null,
      direction: f.direction ?? null,
      numericFidelity: 'transcript_vs_lseg',
    })
  }

  return rows
}

function ActualVsConsensusBlock({
  rows,
  recs,
}: {
  rows: MergedRow[]
  recs: { buy: number | null; hold: number | null; sell: number | null } | null
}) {
  if (rows.length === 0 && !recs) return null
  return (
    <div className="rounded-lg border border-border bg-surface-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-text-secondary">Actual vs consensus (closest to event date)</h4>
        <SourceTag source="LSEG" lsegKind="surprise" />
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-muted text-left text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-3 py-2">Metric</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-right">Mean est.</th>
                <th className="px-3 py-2 text-right">Surprise %</th>
                <th className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    SUE
                    <InfoTip>
                      <strong>Standardized Unexpected Earnings</strong> — surprise normalized by estimate dispersion. |SUE| &lt; 1 = in line, 1-2 = meaningful, &gt; 2 = large surprise.
                    </InfoTip>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const sueDisplay =
                  row.sue != null ? `${fmtNum(row.sue, 2)} — ${interpretSue(row.sue)}` : '—'
                const tone =
                  row.surprisePct == null
                    ? 'text-text-secondary'
                    : row.surprisePct > 0
                      ? 'text-bull-700'
                      : row.surprisePct < 0
                        ? 'text-bear-700'
                        : 'text-text-secondary'
                return (
                  <tr key={`${row.metric}-${i}`} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-text-primary">
                      {row.metric}
                      {row.direction && (
                        <span className={`ml-2 text-[10px] uppercase tracking-wide ${tone}`}>{row.direction}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(row.actual, 4)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(row.consensus, 4)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${tone}`}>{fmtPct(row.surprisePct)}</td>
                    <td className="px-3 py-2 tabular-nums">{sueDisplay}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {recs && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">Analyst recs:</span>
          <span className="font-mono tabular-nums">
            <span className="text-bull-700">{recs.buy ?? '—'}</span>
            {' / '}
            <span className="text-warn-900">{recs.hold ?? '—'}</span>
            {' / '}
            <span className="text-bear-700">{recs.sell ?? '—'}</span>
            <span className="ml-1 text-[11px] font-normal text-text-muted">(buy / hold / sell)</span>
          </span>
        </div>
      )}

    </div>
  )
}

function formatLsegFieldName(rawKey: string): string {
  let s = rawKey
  const paren = s.indexOf('(')
  if (paren > 0) s = s.slice(0, paren)
  s = s.replace(/^TR\./, '')
  s = s.replace(/([A-Z])/g, ' $1').replace(/^ +/, '')
  return s.trim() || rawKey
}

function RevenueSparkline({ fundamentals }: { fundamentals: Record<string, unknown> }) {
  const revenueKey = Object.keys(fundamentals).find((k) => k.toLowerCase().includes('revenue'))
  if (!revenueKey) return null
  const cell = fundamentals[revenueKey]
  if (!cell || typeof cell !== 'object') return null
  const entries = Object.entries(cell as Record<string, unknown>)
  if (entries.length < 3) return null
  const numericPts = entries
    .map(([k, v]) => ({ k, v: typeof v === 'number' ? v : null }))
    .filter((p) => p.v !== null)
    .slice(-6)
  if (numericPts.length < 3) return null

  const total = numericPts.length
  const data = numericPts.map((p, i) => {
    const lag = total - 1 - i
    const label = lag === 0 ? 'Latest (T-0)' : `T-${lag}`
    return { label, value: p.v }
  })

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {formatLsegFieldName(revenueKey)} — last {total} reported periods
        </span>
        <SourceTag source="LSEG" lsegKind="fundamentals" />
      </div>
      <p className="mb-2 text-[11px] text-text-muted">
        T-minus labels are relative periods: T-4 means 4 reported periods before the latest available period.
      </p>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartTheme.axis }} />
            <YAxis tick={{ fontSize: 10, fill: chartTheme.axis }} tickFormatter={(v: number) => fmtNum(v, 0)} width={48} />
            <Line type="monotone" dataKey="value" stroke={chartTheme.accent} strokeWidth={2} dot={{ r: 2 }} />
            <ReTooltip
              contentStyle={{ background: chartTheme.tooltipBg, borderColor: chartTheme.tooltipBorder }}
              formatter={(v: number) => fmtNum(v, 2)}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function StatedFiguresTable({ figures }: { figures: StatedFigure[] }) {
  if (figures.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-surface-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-text-secondary">Stated figures from the call</h4>
        <SourceTag source="Transcript" />
      </div>
      <div className="space-y-1.5">
        {figures.slice(0, 8).map((f, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5 text-sm last:border-b-0">
            <span className="text-text-secondary">{f.label}</span>
            <span className="font-mono font-medium text-text-primary tabular-nums">
              {f.value !== null ? `${f.value} ${f.unit}` : 'N/A'}
              {f.yoy_change !== null && f.yoy_change !== undefined && (
                <span className={`ml-2 text-xs ${f.yoy_change >= 0 ? 'text-bull-700' : 'text-bear-700'}`}>
                  {f.yoy_change >= 0 ? '+' : ''}
                  {(f.yoy_change * 100).toFixed(1)}%
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * LSEG & Financials — single panel.
 *
 * Restructured per user feedback:
 *   - Coverage pills (price window / instrument metadata / fundamentals) removed.
 *   - The standalone Consensus block and the "Stated results vs market"
 *     beat-miss table merged into one "Actual vs consensus" block, since
 *     they were duplicating EPS/Revenue between them. Analyst recs and
 *     EBITDA-only consensus rows are folded in.
 *   - Stated figures from the call still render on the right (Transcript-tagged).
 *   - Computed ratios (when present) keep their own sub-block. */
export function LSEGInsightsPanel({ lseg_data, market, metadata, financials }: Props) {
  const lseg: LSEGMarketData | null = lseg_data
  const est: EstimatesSurpriseFY0 | null | undefined = lseg?.estimates_surprise_fy0

  const instrumentLine = (() => {
    const parts: string[] = []
    const disp = lseg?.instrument_display
    if (disp?.company_name) parts.push(disp.company_name)
    if (disp?.exchange_name) parts.push(disp.exchange_name)
    const ric = lseg?.resolved_ric ?? metadata.resolved_ric ?? metadata.ric
    if (ric) parts.push(`RIC ${ric}`)
    return parts.join(' · ') || 'Instrument not resolved'
  })()

  const recs = lseg?.consensus
    ? {
        buy: lseg.consensus.analyst_buy_count ?? null,
        hold: lseg.consensus.analyst_hold_count ?? null,
        sell: lseg.consensus.analyst_sell_count ?? null,
      }
    : null
  const recsHasAny = recs && (recs.buy != null || recs.hold != null || recs.sell != null) ? recs : null

  const mergedRows = mergeRows(est, lseg?.consensus, market.beat_miss_flags)

  return (
    <div className="maecas-card">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="maecas-eyebrow">Market Data</p>
          <h3 className="maecas-title">LSEG &amp; Financials</h3>
          <p className="mt-1 text-sm text-text-secondary">
            One block for actual vs consensus. Stated figures from the call on the right.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              lseg?.lseg_available ? 'bg-bull-100 text-bull-900' : 'bg-warn-100 text-warn-900'
            }`}
          >
            {lseg?.lseg_available ? 'LSEG session active' : 'LSEG unavailable'}
          </span>
          {market.low_confidence_flag && (
            <span className="rounded-full border border-warn-100 bg-warn-50 px-3 py-1 text-xs font-medium text-warn-900">
              Low-confidence run
            </span>
          )}
          <MethodChip panel="lseg" scoreOrBucket="Stated vs consensus (beat/miss flags)" />
        </div>
      </div>

      <p className="mb-4 text-sm text-text-primary">{instrumentLine}</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <ActualVsConsensusBlock rows={mergedRows} recs={recsHasAny} />
          {lseg?.fundamentals && <RevenueSparkline fundamentals={lseg.fundamentals} />}
        </div>

        <div className="space-y-6">
          {financials && <StatedFiguresTable figures={financials.figures} />}

          {market.computed_metrics.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-text-secondary">Computed ratios</h4>
              <div className="space-y-2">
                {market.computed_metrics.map((m) => (
                  <div key={m.metric} className="rounded border border-border p-2 text-xs">
                    <p className="font-medium text-text-primary">{m.metric}</p>
                    <p className="text-text-muted">{m.formula}</p>
                    <p className="mt-1 text-text-primary">{m.value == null ? '—' : `${m.value.toFixed(2)} ${m.unit}`}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
