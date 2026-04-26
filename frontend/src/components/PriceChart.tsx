import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import type { PricePoint } from '../types/api'
import { chartTheme } from '../lib/chartTheme'

interface Props {
  priceHistory: PricePoint[]
  earningsDate: string
  prePct: number | null
  postPct: number | null
}

export function PriceChart({ priceHistory, earningsDate, prePct, postPct }: Props) {
  if (priceHistory.length === 0) {
    return (
      <div className="maecas-card">
        <h3 className="maecas-title mb-2">Price History</h3>
        <p className="text-sm text-text-muted">No price data available (LSEG unavailable)</p>
      </div>
    )
  }

  const data = priceHistory.map((p) => ({
    date: p.date.split('T')[0],
    close: p.close,
    volume: p.volume,
  }))

  const earningsShort = earningsDate.split('T')[0]

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Market</p>
          <h3 className="maecas-title">Price History (-30d / +10d)</h3>
        </div>
        <div className="flex gap-4 text-sm">
          {prePct !== null && (
            <span className={`font-mono ${prePct >= 0 ? 'text-bull-700' : 'text-bear-700'}`}>
              Pre: {prePct >= 0 ? '+' : ''}{prePct.toFixed(1)}%
            </span>
          )}
          {postPct !== null && (
            <span className={`font-mono ${postPct >= 0 ? 'text-bull-700' : 'text-bear-700'}`}>
              Post: {postPct >= 0 ? '+' : ''}{postPct.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: chartTheme.axis }} interval="preserveStartEnd" />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: chartTheme.axis }} />
            <Tooltip contentStyle={{ background: chartTheme.tooltipBg, borderColor: chartTheme.tooltipBorder }} />
            <ReferenceLine x={earningsShort} stroke={chartTheme.accent} strokeDasharray="5 5" label="Earnings" />
            <Line type="monotone" dataKey="close" stroke={chartTheme.line} dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
