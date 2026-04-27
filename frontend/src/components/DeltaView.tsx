import { MinusCircle, PlusCircle } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { QoQDelta } from '../types/api'
import { OrdinalChip, deltaToOrdinal } from '../lib/ordinal'
import { chartTheme } from '../lib/chartTheme'
import { MethodologyTip } from './MethodologyTip'

interface Props {
  delta: QoQDelta | null
}

function DriftBadge({
  label,
  value,
  positiveIsBad,
}: {
  label: string
  value: number
  positiveIsBad: boolean
}) {
  const harmful = positiveIsBad ? value > 0.5 : value < -0.5
  const beneficial = positiveIsBad ? value < -0.5 : value > 0.5
  const tone = harmful ? 'text-bear-700' : beneficial ? 'text-bull-700' : 'text-text-muted'
  const sign = value > 0 ? '+' : ''
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${tone}`}>
      <span>{label}:</span>
      <span className="font-mono font-medium">
        {sign}
        {value.toFixed(1)}
      </span>
    </span>
  )
}

function formatDateLabel(raw: string): string {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw.split('T')[0] || raw
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function trajectoryStatusLabel(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === 'new') return 'new since this call'
  if (normalized === 'repeated') return 'carried forward'
  if (normalized === 'de_emphasized') return 'less emphasized now'
  if (normalized === 'resolved') return 'resolved now'
  return status.replace(/_/g, ' ')
}

function trajectoryStatusClass(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === 'new') return 'border-bull-100 bg-bull-50 text-bull-900'
  if (normalized === 'repeated') return 'border-info-100 bg-info-100 text-info-900'
  if (normalized === 'de_emphasized' || normalized === 'resolved') {
    return 'border-bear-100 bg-bear-50 text-bear-900'
  }
  return 'border-border bg-surface-card text-text-secondary'
}

export function DeltaView({ delta }: Props) {
  if (!delta) return null

  const isNewTopic = (status: string): boolean => status.toLowerCase() === 'new'
  const isRepeatedTopic = (status: string): boolean => status.toLowerCase() === 'repeated'
  const isNoLongerMentionedTopic = (status: string): boolean => {
    const normalized = status.toLowerCase()
    return normalized === 'de_emphasized' || normalized === 'resolved'
  }

  const newTopics = delta.topic_deltas.filter((row) => isNewTopic(row.novelty_status))
  const repeatedTopics = delta.topic_deltas.filter((row) => isRepeatedTopic(row.novelty_status))
  const noLongerMentionedTopics = delta.topic_deltas.filter((row) =>
    isNoLongerMentionedTopic(row.novelty_status)
  )

  const chartRows = repeatedTopics
    .map((row) => ({
      topic: row.topic,
      shortTopic: row.topic.length > 42 ? `${row.topic.slice(0, 39)}...` : row.topic,
      sentimentDelta: Number(row.sentiment_delta.toFixed(2)),
    }))
    .sort((a, b) => a.sentimentDelta - b.sentimentDelta)

  const topicShifts = repeatedTopics
    .map((row) => ({ topic: row.topic, ordinal: deltaToOrdinal(row.sentiment_delta) }))
    .sort((a, b) => {
      const order = { up: 0, down: 1, flat: 2, none: 3 } as const
      return order[a.ordinal.direction] - order[b.ordinal.direction]
    })

  const drift = delta.language_drift
  const trajectory = delta.topic_trajectory ?? []

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Comparison</p>
          <h3 className="maecas-title">Quarter-over-Quarter Changes</h3>
        </div>
      </div>

      <div className="mb-6">
        {delta.comparison_window && (
          <div className="mb-3 rounded border border-border bg-surface-card p-3 text-xs text-text-secondary">
            Comparing {delta.comparison_window.current_event_date} against {delta.comparison_window.prior_event_dates.length} prior quarter(s):{' '}
            {delta.comparison_window.prior_event_dates.join(', ')}
          </div>
        )}
        <h4 className="mb-2 text-sm font-medium text-text-secondary">Topic Mention Changes</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded border border-border bg-surface-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-bull-700">Newly mentioned</p>
            <div className="flex flex-wrap gap-1.5">
              {newTopics.length > 0 ? (
                newTopics.map((row) => (
                  <span key={row.topic} className="rounded bg-bull-50 px-2 py-0.5 text-xs text-bull-900">
                    {row.topic}
                  </span>
                ))
              ) : (
                <span className="text-xs text-text-muted">None detected.</span>
              )}
            </div>
          </div>
          <div className="rounded border border-border bg-surface-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warn-900">Mentioned in both</p>
            <div className="flex flex-wrap gap-1.5">
              {repeatedTopics.length > 0 ? (
                repeatedTopics.map((row) => (
                  <span key={row.topic} className="rounded bg-warn-50 px-2 py-0.5 text-xs text-warn-900">
                    {row.topic}
                  </span>
                ))
              ) : (
                <span className="text-xs text-text-muted">None detected.</span>
              )}
            </div>
          </div>
          <div className="rounded border border-border bg-surface-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-bear-700">
              No longer mentioned topics
            </p>
            <div className="flex flex-wrap gap-1.5">
              {noLongerMentionedTopics.length > 0 ? (
                noLongerMentionedTopics.map((row) => (
                  <span key={row.topic} className="rounded bg-bear-50 px-2 py-0.5 text-xs text-bear-900">
                    {row.topic}
                  </span>
                ))
              ) : (
                <span className="text-xs text-text-muted">
                  None detected at topic level; phrase-level removals appear below when available.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {topicShifts.length > 0 && (
        <div className="mb-5">
          <h4 className="mb-2 text-sm font-medium text-text-secondary">
            Tone shifts for topics mentioned again
          </h4>
          <div className="mb-4 h-64 rounded border border-border bg-surface-card p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                <XAxis
                  type="number"
                  domain={[-0.4, 0.4]}
                  tick={{ fontSize: 10, fill: chartTheme.axis }}
                  tickFormatter={(v: number) => (v === 0 ? '0' : v.toFixed(1))}
                />
                <YAxis
                  type="category"
                  dataKey="shortTopic"
                  width={220}
                  tick={{ fontSize: 10, fill: chartTheme.axis }}
                />
                <ReferenceLine x={0} stroke={chartTheme.axis} />
                <Tooltip
                  contentStyle={{ background: chartTheme.tooltipBg, borderColor: chartTheme.tooltipBorder }}
                  formatter={(v: number) => [`${v > 0 ? '+' : ''}${v.toFixed(2)}`, 'Sentiment delta']}
                  labelFormatter={(_, payload) =>
                    payload && payload[0] && payload[0].payload ? payload[0].payload.topic : ''
                  }
                />
                <Bar
                  dataKey="sentimentDelta"
                  radius={[2, 2, 2, 2]}
                  fill={chartTheme.accent}
                >
                  {chartRows.map((entry) => (
                    <Cell key={entry.topic} fill={entry.sentimentDelta >= 0 ? '#2F7A50' : '#933036'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {topicShifts.map((row) => (
              <div
                key={row.topic}
                className="flex items-center justify-between gap-2 rounded border border-border bg-surface-card px-2 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-text-primary">{row.topic}</span>
                <OrdinalChip result={row.ordinal} size="sm" />
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-text-muted">
            Direction buckets only. Double arrows mark larger moves; centred bucket suppresses moves within model noise floor.
          </p>
        </div>
      )}

      {topicShifts.length === 0 && (
        <div className="mb-5 rounded border border-border bg-surface-card px-3 py-2 text-xs text-text-muted">
          No repeated topics were found, so there are no quarter-over-quarter tone shifts to compare.
        </div>
      )}

      {drift && (drift.added_phrases.length > 0 || drift.removed_phrases.length > 0) && (
        <div className="mb-5 rounded-lg border border-border bg-surface-muted/60 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <h4 className="text-sm font-medium text-text-primary">Language drift</h4>
            <DriftBadge label="Hedging drift" value={drift.hedging_drift} positiveIsBad />
            <DriftBadge label="Certainty drift" value={drift.certainty_drift} positiveIsBad={false} />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-bull-700">
                <PlusCircle className="h-3 w-3" /> Started saying
              </p>
              <div className="flex flex-wrap gap-1.5">
                {drift.added_phrases.slice(0, 12).map((p) => (
                  <span key={p} className="rounded bg-bull-50 px-2 py-0.5 text-xs text-bull-900">
                    {p}
                  </span>
                ))}
                {drift.added_phrases.length === 0 && (
                  <span className="text-xs text-text-muted">No distinctive new phrases.</span>
                )}
              </div>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-bear-700">
                <MinusCircle className="h-3 w-3" /> Stopped saying
              </p>
              <div className="flex flex-wrap gap-1.5">
                {drift.removed_phrases.slice(0, 12).map((p) => (
                  <span key={p} className="rounded bg-bear-50 px-2 py-0.5 text-xs text-bear-900">
                    {p}
                  </span>
                ))}
                {drift.removed_phrases.length === 0 && (
                  <span className="text-xs text-text-muted">No distinctive phrases dropped.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {delta.trend_deltas && delta.trend_deltas.length > 0 && (
        <div className="mb-5 rounded border border-border bg-surface-card p-3">
          <h4 className="mb-2 text-sm font-medium text-text-secondary">Multi-quarter trend deltas</h4>
          <div className="space-y-2">
            {delta.trend_deltas.slice(0, 8).map((t, i) => (
              <div key={`${t.topic}-${i}`} className="rounded border border-border bg-surface-muted/50 p-2">
                <p className="text-sm font-medium text-text-primary">{t.topic}</p>
                <p className="text-xs text-text-secondary">{t.trend}</p>
                <p className="text-xs text-text-muted">{t.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {trajectory.length > 0 && (
        <div className="mb-5 rounded border border-border bg-surface-card p-3">
          <h4 className="mb-1 text-sm font-medium text-text-secondary">Topic history vs prior quarters</h4>
          <p className="mb-3 text-xs text-text-muted">
            Each chip reads as: compared with that earlier call, how does the topic appear in the current call?
          </p>
          <div className="space-y-2">
            {trajectory.slice(0, 10).map((row) => (
              <div key={row.topic} className="rounded border border-border bg-surface-muted/50 p-2">
                <p className="mb-1 text-sm font-medium text-text-primary">{row.topic}</p>
                <div className="flex flex-wrap gap-1.5">
                  {row.points.map((point) => (
                    <span
                      key={`${row.topic}-${point.event_date}-${point.novelty_status}`}
                      className={`rounded border px-2 py-0.5 text-[11px] ${trajectoryStatusClass(point.novelty_status)}`}
                      title={`Sentiment delta ${point.sentiment_delta.toFixed(2)}`}
                    >
                      vs {formatDateLabel(point.event_date)}: {trajectoryStatusLabel(point.novelty_status)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {delta.stability_checks && (
        <div className="mb-3 rounded border border-border bg-surface-muted/60 p-3 text-xs text-text-secondary">
          Coverage: {delta.stability_checks.citation_coverage_ratio.toFixed(2)}
          {delta.stability_checks.disagreement_flags.length > 0 && (
            <span> · Flags: {delta.stability_checks.disagreement_flags.slice(0, 2).join(' | ')}</span>
          )}
          {delta.stability_checks.low_confidence_reasons.length > 0 && (
            <span> · Low-confidence: {delta.stability_checks.low_confidence_reasons.slice(0, 2).join(' | ')}</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
        <span>
          Guidance specificity delta:{' '}
          {delta.guidance_specificity_delta > 0 ? '+' : ''}
          {delta.guidance_specificity_delta}
        </span>
        <MethodologyTip>{delta.methodology.heuristic}</MethodologyTip>
        {delta.new_risk_keywords.length > 0 && (
          <span className="text-warn-900">
            New risks: {delta.new_risk_keywords.join(', ')}
          </span>
        )}
      </div>
    </div>
  )
}
