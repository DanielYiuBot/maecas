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
import { MethodChip } from './MethodChip'
import { SourceTag } from './SourceTag'
import { ScoreBar } from './ScoreBar'

interface Props {
  delta: QoQDelta | null
}

function formatDateLabel(raw: string): string {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw.split('T')[0] || raw
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function trajectoryStatusLabel(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === 'new') return 'new'
  if (normalized === 'repeated') return 'carried forward'
  if (normalized === 'de_emphasized') return 'less emphasized'
  if (normalized === 'resolved') return 'resolved'
  return status.replace(/_/g, ' ')
}

function trajectoryStatusClass(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === 'new') return 'border-bull-100 bg-bull-50 text-bull-900'
  if (normalized === 'repeated') return 'border-info-100 bg-info-100 text-info-900'
  if (normalized === 'de_emphasized' || normalized === 'resolved') return 'border-bear-100 bg-bear-50 text-bear-900'
  return 'border-border bg-surface-card text-text-secondary'
}

/**
 * QoQ change panel — fuses the old separate "topic mention changes",
 * "tone shifts", "language drift", "trend deltas", and "topic trajectory"
 * sub-blocks into a single timeline view.
 *
 * Topic trajectory chips merge into the per-topic rows directly; the
 * stand-alone trajectory section is gone. Hedging drift renders as a
 * polarity-aware ScoreBar so the user sees magnitude visually rather than
 * by reading raw numbers. */
export function QoQPanel({ delta }: Props) {
  if (!delta) return null

  const isNew = (status: string) => status.toLowerCase() === 'new'
  const isRepeated = (status: string) => status.toLowerCase() === 'repeated'
  const isDropped = (status: string) => {
    const n = status.toLowerCase()
    return n === 'de_emphasized' || n === 'resolved'
  }

  const newTopics = delta.topic_deltas.filter((row) => isNew(row.novelty_status))
  const repeatedTopics = delta.topic_deltas.filter((row) => isRepeated(row.novelty_status))
  const droppedTopics = delta.topic_deltas.filter((row) => isDropped(row.novelty_status))

  const trajectoryByTopic = new Map<string, NonNullable<QoQDelta['topic_trajectory']>[number]>()
  for (const t of delta.topic_trajectory ?? []) {
    trajectoryByTopic.set(t.topic, t)
  }

  const chartRows = repeatedTopics
    .map((row) => ({
      topic: row.topic,
      shortTopic: row.topic.length > 42 ? `${row.topic.slice(0, 39)}...` : row.topic,
      sentimentDelta: Number(row.sentiment_delta.toFixed(2)),
    }))
    .sort((a, b) => a.sentimentDelta - b.sentimentDelta)

  const drift = delta.language_drift

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Comparison</p>
          <h3 className="maecas-title">Quarter-over-Quarter Changes</h3>
        </div>
        <div className="flex items-center gap-2">
          <SourceTag source="Transcript" />
          <MethodChip panel="qoq" scoreOrBucket="Topic deltas" />
        </div>
      </div>

      {delta.comparison_window && (
        <div className="mb-3 rounded border border-border bg-surface-card p-3 text-xs text-text-secondary">
          Comparing {delta.comparison_window.current_event_date} against {delta.comparison_window.prior_event_dates.length} prior
          quarter(s): {delta.comparison_window.prior_event_dates.join(', ')}
        </div>
      )}

      <div className="mb-6">
        <h4 className="mb-2 text-sm font-medium text-text-secondary">Topic mention changes</h4>
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-bear-700">No longer mentioned</p>
            <div className="flex flex-wrap gap-1.5">
              {droppedTopics.length > 0 ? (
                droppedTopics.map((row) => (
                  <span key={row.topic} className="rounded bg-bear-50 px-2 py-0.5 text-xs text-bear-900">
                    {row.topic}
                  </span>
                ))
              ) : (
                <span className="text-xs text-text-muted">None.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {chartRows.length > 0 && (
        <div className="mb-5">
          <h4 className="mb-2 text-sm font-medium text-text-secondary">Tone shifts for topics mentioned again</h4>
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
                <YAxis type="category" dataKey="shortTopic" width={220} tick={{ fontSize: 10, fill: chartTheme.axis }} />
                <ReferenceLine x={0} stroke={chartTheme.axis} />
                <Tooltip
                  contentStyle={{ background: chartTheme.tooltipBg, borderColor: chartTheme.tooltipBorder }}
                  formatter={(v: number) => [`${v > 0 ? '+' : ''}${v.toFixed(2)}`, 'Sentiment delta']}
                  labelFormatter={(_, payload) => (payload && payload[0] && payload[0].payload ? payload[0].payload.topic : '')}
                />
                <Bar dataKey="sentimentDelta" radius={[2, 2, 2, 2]} fill={chartTheme.accent}>
                  {chartRows.map((entry) => (
                    <Cell key={entry.topic} fill={entry.sentimentDelta >= 0 ? '#2F7A50' : '#933036'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {repeatedTopics.map((row) => {
              const ordinal = deltaToOrdinal(row.sentiment_delta)
              const traj = trajectoryByTopic.get(row.topic)
              return (
                <div
                  key={row.topic}
                  className="flex items-center gap-2 rounded border border-border bg-surface-card px-2 py-1.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-text-primary">{row.topic}</span>
                  {traj && traj.points.length > 0 && (
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] ${trajectoryStatusClass(
                        traj.points[traj.points.length - 1].novelty_status,
                      )}`}
                      title={`vs ${formatDateLabel(traj.points[traj.points.length - 1].event_date)}`}
                    >
                      {trajectoryStatusLabel(traj.points[traj.points.length - 1].novelty_status)}
                    </span>
                  )}
                  <OrdinalChip result={ordinal} size="sm" />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {drift && (
        <div className="mb-5 rounded-lg border border-border bg-surface-muted/60 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h4 className="text-sm font-medium text-text-primary">Language drift</h4>
            <SourceTag source="Transcript" />
            <MethodChip panel="qoq" scoreOrBucket="Hedging drift" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ScoreBar
              label="Hedging drift"
              description="vs prior quarter; positive = more hedging"
              value={drift.hedging_drift}
              min={-3}
              max={3}
              polarity="higher_is_concerning"
              valueLabel={`${drift.hedging_drift > 0 ? '+' : ''}${drift.hedging_drift.toFixed(1)}`}
            />
            <ScoreBar
              label="Certainty drift"
              description="vs prior quarter; positive = more certain"
              value={drift.certainty_drift}
              min={-3}
              max={3}
              polarity="higher_is_better"
              valueLabel={`${drift.certainty_drift > 0 ? '+' : ''}${drift.certainty_drift.toFixed(1)}`}
            />
          </div>

          {(drift.added_phrases.length > 0 || drift.removed_phrases.length > 0) && (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
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
                  {drift.added_phrases.length === 0 && <span className="text-xs text-text-muted">No distinctive new phrases.</span>}
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
                  {drift.removed_phrases.length === 0 && <span className="text-xs text-text-muted">No distinctive phrases dropped.</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {delta.trend_deltas && delta.trend_deltas.length > 0 && (
        <div className="mb-5 rounded border border-border bg-surface-card p-3">
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-sm font-medium text-text-secondary">Multi-quarter trend deltas</h4>
            <SourceTag source="Transcript" />
          </div>
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

    </div>
  )
}
