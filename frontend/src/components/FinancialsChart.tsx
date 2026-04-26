import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { StatedFigure, StatedFinancials } from '../types/api'
import { chartTheme } from '../lib/chartTheme'

interface Props {
  financials: StatedFinancials
}

const SEGMENT_DEFINITIONS: Array<{ id: string; label: string; match: (s: string) => boolean; color: string }> = [
  { id: 'data_center', label: 'Data Center', match: (s) => /data\s?center|dc|hyperscaler|ai\s?platform|cloud/.test(s), color: '#1C2A4A' },
  { id: 'gaming', label: 'Gaming', match: (s) => /gaming|geforce/.test(s), color: '#2F7A50' },
  { id: 'networking', label: 'Networking', match: (s) => /network|infiniband|ethernet/.test(s), color: '#B57A24' },
  { id: 'automotive', label: 'Automotive', match: (s) => /auto|vehicle|automotive/.test(s), color: '#933036' },
  { id: 'professional', label: 'Professional Viz', match: (s) => /pro\s?viz|workstation|visualization|professional\s?visualization/.test(s), color: '#3C6E9E' },
  { id: 'other', label: 'Other', match: () => true, color: '#828996' },
]

function classifySegment(label: string): string {
  const lower = label.toLowerCase()
  for (const seg of SEGMENT_DEFINITIONS) {
    if (seg.id === 'other') continue
    if (seg.match(lower)) return seg.id
  }
  return 'other'
}

function isRevenueFigure(f: StatedFigure): boolean {
  const low = f.label.toLowerCase()
  return /revenue|sales|segment/.test(low) && f.value !== null && f.value > 0
}

function isTopLevelRevenue(label: string): boolean {
  const l = label.toLowerCase()
  return /^total\s+revenue|^revenue$|^net\s+revenue/.test(l)
}

function buildSegmentedData(financials: StatedFinancials): Array<Record<string, number | string>> {
  const byPeriod: Record<string, Record<string, number>> = {}
  const figures = financials.figures.filter(isRevenueFigure)
  for (const f of figures) {
    if (isTopLevelRevenue(f.label)) continue
    const period = f.period ?? f.label
    const segId = classifySegment(f.label)
    if (!byPeriod[period]) byPeriod[period] = {}
    byPeriod[period][segId] = (byPeriod[period][segId] ?? 0) + (f.value ?? 0)
  }

  const rows = Object.entries(byPeriod).map(([period, segs]) => ({
    period,
    ...segs,
  }))

  const uniqueSegments = new Set<string>()
  rows.forEach((r) => {
    Object.keys(r).forEach((k) => {
      if (k !== 'period') uniqueSegments.add(k)
    })
  })

  return rows.filter((r) => uniqueSegments.size > 0 && Object.keys(r).length > 1)
}

export function FinancialsChart({ financials }: Props) {
  const data = buildSegmentedData(financials)

  const activeSegments = SEGMENT_DEFINITIONS.filter((seg) =>
    data.some((row) => (row as Record<string, unknown>)[seg.id] !== undefined)
  )

  const showChart = data.length >= 2 && activeSegments.length >= 2

  if (!showChart) {
    const summaryFigures = financials.figures.slice(0, 8)
    return (
      <div className="maecas-card">
        <div className="maecas-card-head">
          <div>
            <p className="maecas-eyebrow">Financials</p>
            <h3 className="maecas-title">Key Financial Figures</h3>
            <p className="maecas-subtitle mt-0.5">
              Segment split unavailable — showing stated figures directly.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {summaryFigures.map((f, i) => (
            <div key={i} className="flex justify-between border-b border-border pb-2 text-sm">
              <span className="text-text-secondary">{f.label}</span>
              <span className="font-mono font-medium">
                {f.value !== null ? `${f.value} ${f.unit}` : 'N/A'}
                {f.yoy_change !== null && (
                  <span className={`ml-2 text-xs ${f.yoy_change >= 0 ? 'text-bull-700' : 'text-bear-700'}`}>
                    {f.yoy_change >= 0 ? '+' : ''}{(f.yoy_change * 100).toFixed(1)}%
                  </span>
                )}
              </span>
            </div>
          ))}
          {financials.figures.length === 0 && (
            <p className="text-sm text-text-muted">No financial figures extracted</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Financials</p>
          <h3 className="maecas-title">Revenue by Segment</h3>
          <p className="maecas-subtitle mt-0.5">Stacked by product line across reported periods.</p>
        </div>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis dataKey="period" tick={{ fontSize: 10, fill: chartTheme.axis }} />
            <YAxis tick={{ fontSize: 10, fill: chartTheme.axis }} />
            <Tooltip contentStyle={{ background: chartTheme.tooltipBg, borderColor: chartTheme.tooltipBorder }} />
            <Legend />
            {activeSegments.map((seg) => (
              <Bar key={seg.id} dataKey={seg.id} stackId="rev" fill={seg.color} name={seg.label} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
