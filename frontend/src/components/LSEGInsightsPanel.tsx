import type { ReactNode } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from 'recharts'
import { HelpCircle } from 'lucide-react'
import type {
  AnalysisReport,
  BeatMissFlag,
  ConsensusEstimates,
  EstimateRevisions,
  EstimatesSurpriseFY0,
  LSEGMarketData,
  MetricSurpriseSnapshot,
} from '../types/api'
import { chartTheme } from '../lib/chartTheme'
import { MethodologyTip } from './MethodologyTip'

type Props = Pick<AnalysisReport, 'lseg_data' | 'market' | 'metadata'>

const BLOCK_LABELS: Record<string, string> = {
  price: 'Price window',
  fundamentals: 'Fundamentals',
  consensus: 'Consensus (event-aligned)',
  estimates_surprise_fy0: 'Estimates vs actual (FY0)',
  instrument_display: 'Instrument metadata',
  estimate_revisions: 'Estimate revisions',
}

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

function SurpriseTable({ title, snap }: { title: string; snap: MetricSurpriseSnapshot | null }) {
  if (!surpriseHasData(snap)) return null
  const sueValue = snap!.sue_score
  const sueDisplay = sueValue != null
    ? `${fmtNum(sueValue, 2)} — ${interpretSue(sueValue)}`
    : '—'
  const rows: { label: string; value: string; tip?: ReactNode }[] = [
    { label: 'Actual', value: fmtNum(snap!.actual, 4) },
    { label: 'Mean est.', value: fmtNum(snap!.mean_estimate, 4) },
    { label: 'Surprise %', value: fmtPct(snap!.surprise_pct) },
    {
      label: 'SUE',
      value: sueDisplay,
      tip: (
        <>
          <strong>Standardized Unexpected Earnings</strong> — surprise normalized by estimate dispersion.
          {' '}|SUE| &lt; 1 = in line, 1-2 = meaningful, &gt; 2 = large surprise.
        </>
      ),
    },
    { label: '# est.', value: snap!.num_estimates != null ? String(snap!.num_estimates) : '—' },
    { label: 'Act. date', value: snap!.act_report_date ?? '—' },
  ].filter((r) => r.value !== '—')

  if (rows.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-surface-muted/60 p-4">
      <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">{title}</h5>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {rows.map(({ label, value, tip }) => (
          <div key={label} className="contents">
            <dt className="flex items-center gap-1 text-text-secondary">
              {label}
              {tip && <InfoTip>{tip}</InfoTip>}
            </dt>
            <dd className="text-right font-medium text-text-primary tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function consensusHasData(c: ConsensusEstimates | null | undefined): boolean {
  if (!c) return false
  return (
    c.eps_mean != null ||
    c.revenue_mean != null ||
    c.ebitda_mean != null ||
    c.analyst_buy_count != null ||
    c.analyst_hold_count != null ||
    c.analyst_sell_count != null
  )
}

function ConsensusBlock({ c }: { c: ConsensusEstimates }) {
  const rows: Array<{ label: string; value: ReactNode }> = []
  if (c.eps_mean != null) rows.push({ label: 'EPS mean', value: fmtNum(c.eps_mean, 4) })
  if (c.revenue_mean != null) rows.push({ label: 'Revenue mean', value: fmtNum(c.revenue_mean, 0) })
  if (c.ebitda_mean != null) rows.push({ label: 'EBITDA mean', value: fmtNum(c.ebitda_mean, 0) })

  const hasRecs =
    c.analyst_buy_count != null || c.analyst_hold_count != null || c.analyst_sell_count != null
  if (hasRecs) {
    rows.push({
      label: 'Analyst recs',
      value: (
        <span className="font-mono tabular-nums">
          <span className="text-bull-700">{c.analyst_buy_count ?? '—'}</span>
          {' / '}
          <span className="text-warn-900">{c.analyst_hold_count ?? '—'}</span>
          {' / '}
          <span className="text-bear-700">{c.analyst_sell_count ?? '—'}</span>
          <span className="ml-1 text-[11px] font-normal text-text-muted">(buy/hold/sell)</span>
        </span>
      ),
    })
  }

  if (rows.length === 0) return null

  return (
    <div className="rounded-lg border border-border p-4">
      <h5 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Consensus (event-aligned period)
      </h5>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-text-secondary">{row.label}</dt>
            <dd className="text-right font-medium tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function EstimateRevisionsBlock({ rev }: { rev: EstimateRevisions }) {
  const order: Array<{ key: keyof EstimateRevisions; label: string }> = [
    { key: 'window_90d_ago', label: 'T-90d' },
    { key: 'window_60d_ago', label: 'T-60d' },
    { key: 'window_30d_ago', label: 'T-30d' },
    { key: 'latest', label: 'Now' },
  ]
  const epsSeries = order
    .map(({ key, label }) => ({
      label,
      eps: rev[key]?.eps_mean ?? null,
    }))
    .filter((p) => p.eps !== null)
  const revSeries = order
    .map(({ key, label }) => ({
      label,
      revenue: rev[key]?.revenue_mean ?? null,
    }))
    .filter((p) => p.revenue !== null)

  if (epsSeries.length < 2 && revSeries.length < 2) return null

  const epsDelta =
    epsSeries.length >= 2 && epsSeries[0].eps && epsSeries[epsSeries.length - 1].eps
      ? ((epsSeries[epsSeries.length - 1].eps! - epsSeries[0].eps!) / Math.abs(epsSeries[0].eps!)) * 100
      : null
  const revDelta =
    revSeries.length >= 2 && revSeries[0].revenue && revSeries[revSeries.length - 1].revenue
      ? ((revSeries[revSeries.length - 1].revenue! - revSeries[0].revenue!) /
          Math.abs(revSeries[0].revenue!)) *
        100
      : null

  return (
    <div className="rounded-lg border border-accent-100 bg-accent-50/40 p-4">
      <h5 className="mb-3 text-xs font-semibold uppercase tracking-wide text-accent-700">
        FY1 estimate revisions
      </h5>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {epsSeries.length >= 2 && (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs text-text-secondary">EPS mean</span>
              <span
                className={`font-mono text-xs font-medium ${
                  (epsDelta ?? 0) > 0 ? 'text-bull-700' : (epsDelta ?? 0) < 0 ? 'text-bear-700' : 'text-text-muted'
                }`}
              >
                {epsDelta === null ? '—' : `${epsDelta > 0 ? '+' : ''}${epsDelta.toFixed(1)}% 90d`}
              </span>
            </div>
            <div className="h-14">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={epsSeries}>
                  <Line type="monotone" dataKey="eps" stroke={chartTheme.accent} strokeWidth={2} dot={false} />
                  <ReTooltip contentStyle={{ background: chartTheme.tooltipBg, borderColor: chartTheme.tooltipBorder }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {revSeries.length >= 2 && (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs text-text-secondary">Revenue mean</span>
              <span
                className={`font-mono text-xs font-medium ${
                  (revDelta ?? 0) > 0 ? 'text-bull-700' : (revDelta ?? 0) < 0 ? 'text-bear-700' : 'text-text-muted'
                }`}
              >
                {revDelta === null ? '—' : `${revDelta > 0 ? '+' : ''}${revDelta.toFixed(1)}% 90d`}
              </span>
            </div>
            <div className="h-14">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revSeries}>
                  <Line type="monotone" dataKey="revenue" stroke={chartTheme.line} strokeWidth={2} dot={false} />
                  <ReTooltip contentStyle={{ background: chartTheme.tooltipBg, borderColor: chartTheme.tooltipBorder }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
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

  // The previous "+1195% across shown" headline was a function of how many
  // periods were available, not a meaningful growth rate. Dropped per trader
  // critique. Now the chart speaks for itself with proper Y-axis ticks.
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {formatLsegFieldName(revenueKey)} — last {total} reported periods
        </span>
      </div>
      <p className="mb-2 text-[11px] text-text-muted">
        T-minus labels are relative periods: for example, T-4 means 4 reported periods before the latest available period.
      </p>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartTheme.axis }} />
            <YAxis
              tick={{ fontSize: 10, fill: chartTheme.axis }}
              tickFormatter={(v: number) => fmtNum(v, 0)}
              width={48}
            />
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

function BeatMissTable({ flags }: { flags: BeatMissFlag[] }) {
  if (flags.length === 0) return null
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-muted text-left text-xs uppercase tracking-wide text-text-secondary">
            <th className="px-3 py-2">Metric</th>
            <th className="px-3 py-2 text-right">Stated</th>
            <th className="px-3 py-2 text-right">Consensus</th>
            <th className="px-3 py-2 text-right">Surprise %</th>
            <th className="px-3 py-2">Direction</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((row, i) => (
            <tr key={`${row.metric}-${i}`} className="border-t border-border">
              <td className="px-3 py-2 font-medium text-text-primary">{row.metric}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtNum(row.stated_value, 4)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtNum(row.consensus_value, 4)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtPct(row.surprise_pct)}</td>
              <td className="px-3 py-2">
                {row.direction ? (
                  <span
                    className={
                      row.direction === 'beat'
                        ? 'text-bull-700'
                        : row.direction === 'miss'
                          ? 'text-bear-700'
                          : 'text-text-secondary'
                    }
                  >
                    {row.direction}
                  </span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CoverageBlocks({ blocks }: { blocks: Record<string, boolean> | null | undefined }) {
  if (!blocks) return null
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(blocks)
        .filter(([key]) => key !== 'macro')
        .map(([key, ok]) => (
          <span
            key={key}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              ok
                ? 'border border-bull-100 bg-bull-50 text-bull-900'
                : 'border border-ink-200 bg-ink-100 text-text-muted'
            }`}
          >
            {BLOCK_LABELS[key] ?? key}
            {ok ? '' : ' · empty'}
          </span>
        ))}
    </div>
  )
}

export function LSEGInsightsPanel({ lseg_data, market, metadata }: Props) {
  const lseg: LSEGMarketData | null = lseg_data
  const est: EstimatesSurpriseFY0 | null | undefined = lseg?.estimates_surprise_fy0
  const hasEventEstimateCards = surpriseHasData(est?.eps ?? null) || surpriseHasData(est?.revenue ?? null)

  const instrumentLine = (() => {
    const parts: string[] = []
    const disp = lseg?.instrument_display
    if (disp?.company_name) parts.push(disp.company_name)
    if (disp?.exchange_name) parts.push(disp.exchange_name)
    const ric = lseg?.resolved_ric ?? metadata.resolved_ric ?? metadata.ric
    if (ric) parts.push(`RIC ${ric}`)
    return parts.join(' · ') || 'Instrument not resolved'
  })()

  // The trader called "Context confidence 92%" a meaningless authoritative number.
  // Replace it with a concrete "X of Y blocks empty" chip that only appears when
  // there's an actual gap to surface; otherwise hide it entirely.
  const coverageGap = (() => {
    const blocks = lseg?.lseg_blocks
    if (!blocks) return null
    const entries = Object.entries(blocks).filter(([k]) => k !== 'macro')
    if (entries.length === 0) return null
    const total = entries.length
    const missing = entries.filter(([, ok]) => !ok).map(([key]) => BLOCK_LABELS[key] ?? key)
    const empty = missing.length
    if (empty === 0) return null
    return { total, empty, missing }
  })()

  return (
    <div className="maecas-card">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="maecas-eyebrow">Market Data</p>
          <h3 className="maecas-title">LSEG market data &amp; context</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Consensus and fundamentals from LSEG plus transcript-vs-market synthesis.
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
          {coverageGap && (
            <span
              className="rounded-full border border-warn-100 bg-warn-50 px-3 py-1 text-xs font-medium text-warn-900"
              title={`Missing LSEG block${coverageGap.empty === 1 ? '' : 's'}: ${coverageGap.missing.join(', ')}`}
            >
              {coverageGap.total - coverageGap.empty} of {coverageGap.total} blocks · {coverageGap.missing.join(', ')} unavailable
            </span>
          )}
          {market.low_confidence_flag && (
            <span className="rounded-full border border-warn-100 bg-warn-50 px-3 py-1 text-xs font-medium text-warn-900">
              Low-confidence run
            </span>
          )}
        </div>
      </div>
      <div className="mb-3">
        <MethodologyTip width="lg">{market.methodology.heuristic}</MethodologyTip>
      </div>

      <p className="mb-4 text-sm text-text-primary">{instrumentLine}</p>

      {lseg?.lseg_blocks && (
        <div className="mb-6">
          <h4 className="mb-2 text-sm font-medium text-text-secondary">Data coverage</h4>
          <CoverageBlocks blocks={lseg.lseg_blocks} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {consensusHasData(lseg?.consensus) ? (
            <ConsensusBlock c={lseg!.consensus!} />
          ) : (
            <div className="rounded-lg border border-dashed border-warn-100 bg-warn-50/40 p-4 text-sm text-warn-900">
              <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-warn-900">
                Consensus (FY1 means)
              </h5>
              <p>
                No usable event-aligned consensus means were returned for this request. LSEG may omit
                estimates for some names or lock them behind a different period.
              </p>
            </div>
          )}

          {lseg?.estimate_revisions && <EstimateRevisionsBlock rev={lseg.estimate_revisions} />}

          {hasEventEstimateCards && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-text-secondary">
                Actual vs estimates (closest to event date)
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SurpriseTable title="EPS" snap={est?.eps ?? null} />
                <SurpriseTable title="Revenue" snap={est?.revenue ?? null} />
              </div>
            </div>
          )}

          {lseg?.fundamentals && <RevenueSparkline fundamentals={lseg.fundamentals} />}
        </div>

        <div className="space-y-6">
          {market.analyst_rec_summary && (
            <div className="rounded-lg border border-info-100 bg-info-100/40 p-4">
              <h4 className="mb-1 text-sm font-medium text-info-900">Analyst view (LSEG rec fields)</h4>
              <p className="text-sm text-info-900">{market.analyst_rec_summary}</p>
            </div>
          )}

          {market.beat_miss_flags.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-text-secondary">
                Stated results vs market
              </h4>
              <BeatMissTable flags={market.beat_miss_flags} />
            </div>
          )}

          {market.computed_metrics.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-text-secondary">Computed ratios</h4>
              <div className="space-y-2">
                {market.computed_metrics.map((m) => (
                  <div key={m.metric} className="rounded border border-border p-2 text-xs">
                    <p className="font-medium text-text-primary">{m.metric}</p>
                    <p className="text-text-muted">{m.formula}</p>
                    <p className="mt-1 text-text-primary">
                      {m.value == null ? '—' : `${m.value.toFixed(2)} ${m.unit}`}
                    </p>
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
