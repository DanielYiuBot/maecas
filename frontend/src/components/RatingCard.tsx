import type { AnalysisReport, EvasionScore, GuidanceRange, Signal } from '../types/api'
import {
  OrdinalChip,
  ScoreShiftArrow,
  densityToOrdinal,
  hedgingToOrdinal,
  toneToOrdinal,
  type OrdinalResult,
} from '../lib/ordinal'

interface Props {
  report: AnalysisReport
}

interface TextRow {
  key: string
  label: string
  ordinal: OrdinalResult
  detail: string
  /** Score shift in model units, or null when no prior baseline. */
  shiftDiff: number | null
  hint: string
}

function evasionStats(scores: EvasionScore[]): { hot: number; total: number; topTopic: string | null } {
  if (scores.length === 0) return { hot: 0, total: 0, topTopic: null }
  const hot = scores.filter((e) => e.score >= 3).length
  const byTopic = new Map<string, number>()
  for (const e of scores) {
    if (e.score >= 3) {
      const k = (e.topic || 'unclassified').trim().toLowerCase()
      byTopic.set(k, (byTopic.get(k) ?? 0) + 1)
    }
  }
  const top = [...byTopic.entries()].sort((a, b) => b[1] - a[1])[0]
  return { hot, total: scores.length, topTopic: top ? top[0] : null }
}

function isConcrete(g: GuidanceRange): boolean {
  return g.low !== null && g.high !== null
}

function buildToneRow(report: AnalysisReport): TextRow {
  const s = report.sentiment
  const avg = (s.mgmt_confidence_presentation + s.mgmt_confidence_qa) / 2
  const priorPres = s.mgmt_confidence_presentation_baseline?.prior_quarter
  const priorQA = s.mgmt_confidence_qa_baseline?.prior_quarter
  let detail = 'Presentation and Q&A both bucketed above'
  let shiftDiff: number | null = null
  if (priorPres != null && priorQA != null) {
    const priorAvg = (priorPres + priorQA) / 2
    shiftDiff = avg - priorAvg
    detail += ` · ${Math.abs(avg - priorAvg) >= 2 ? 'meaningful' : 'noise-floor'} move vs prior`
  }
  return {
    key: 'tone',
    label: 'Tone',
    ordinal: toneToOrdinal(avg),
    detail,
    shiftDiff,
    hint: 'Avg of management confidence in Presentation + Q&A',
  }
}

function buildHedgingRow(report: AnalysisReport): TextRow {
  const s = report.sentiment
  const drift = report.delta?.language_drift?.hedging_drift ?? null
  let detail = hedgingToOrdinal(s.hedging_frequency).explanation
  if (drift !== null) {
    detail += ` · drift ${drift > 0 ? '+' : ''}${drift.toFixed(1)} vs prior`
  }
  return {
    key: 'hedging',
    label: 'Hedging',
    ordinal: hedgingToOrdinal(s.hedging_frequency),
    detail,
    shiftDiff: null,
    hint: 'Frequency of qualifier words; lower is more direct',
  }
}

function buildEvasionRow(report: AnalysisReport): TextRow {
  const stats = evasionStats(report.sentiment.evasion_scores)
  const ratio = stats.total === 0 ? 0 : stats.hot / stats.total
  const detail = stats.topTopic
    ? `${stats.hot} of ${stats.total} answers flagged · top topic: ${stats.topTopic}`
    : stats.total === 0
      ? 'No analyst questions parsed'
      : 'No clearly evasive answers'
  return {
    key: 'evasion',
    label: 'Evasion index',
    ordinal: densityToOrdinal(ratio),
    detail,
    shiftDiff: null,
    hint: 'Share of Q&A answers with evasion score >= 3',
  }
}

function buildGuidanceRow(report: AnalysisReport): TextRow {
  const concrete = report.guidance.explicit_guidance.filter(isConcrete).length
  const total = report.guidance.explicit_guidance.length
  const drift = report.delta?.guidance_specificity_delta ?? null
  const ratio = total === 0 ? 0 : concrete / total
  const detail =
    total === 0
      ? 'No explicit guidance provided'
      : drift !== null
        ? `${concrete} of ${total} ranges concrete · QoQ ${drift > 0 ? '+' : ''}${drift}`
        : `${concrete} of ${total} ranges have low+high`
  return {
    key: 'guidance',
    label: 'Guidance specificity',
    ordinal: densityToOrdinal(ratio, { positiveIsGood: true }),
    detail,
    shiftDiff: null,
    hint: 'Share of guidance items with concrete low/high ranges',
  }
}

function buildRiskRow(report: AnalysisReport): TextRow {
  const flagCount = report.risk_flags.length
  const primaryBears = (report.signals.bear_signals ?? []).filter(
    (s: Signal) => s.priority_tier === 'primary',
  ).length
  const total = flagCount + primaryBears
  const ratio = Math.min(1, total / 5)
  const detail =
    total === 0
      ? 'No risk flags or primary bears'
      : `${flagCount} risk flag${flagCount === 1 ? '' : 's'} · ${primaryBears} primary bear signal${primaryBears === 1 ? '' : 's'}`
  return {
    key: 'risk',
    label: 'Risk density',
    ordinal: densityToOrdinal(ratio),
    detail,
    shiftDiff: null,
    hint: 'Risk flags + primary-tier bear signals; higher = more risk surfaced',
  }
}

const LEGEND_ROWS = [
  {
    label: 'Tone',
    scale: '1-3 Defensive · 4-6 Mixed · 7-10 Confident',
    note: 'Higher means management sounded more confident.',
  },
  {
    label: 'Hedging',
    scale: '1-3 Direct · 4-6 Some hedging · 7-10 Heavy hedging',
    note: 'Higher means more qualifier language.',
  },
  {
    label: 'Density metrics',
    scale: '<20% Light · 20-49% Notable · 50%+ Heavy',
    note: 'For evasion/risk, higher is concerning. For guidance specificity, higher is better.',
  },
]

export function RatingCard({ report }: Props) {
  const rows: TextRow[] = [
    buildToneRow(report),
    buildHedgingRow(report),
    buildEvasionRow(report),
    buildGuidanceRow(report),
    buildRiskRow(report),
  ]

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Text-derived</p>
          <h3 className="maecas-title">Transcript Scorecard</h3>
          <p className="maecas-subtitle mt-0.5">
            Five things this transcript actually reveals. Ordinal labels only; model scores stay off the decision surface.
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-border bg-surface-muted/60 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
          How to read this scorecard
        </p>
        <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
          {LEGEND_ROWS.map((row) => (
            <div key={row.label}>
              <p className="font-medium text-text-primary">{row.label}</p>
              <p className="font-mono text-[11px] text-text-secondary">{row.scale}</p>
              <p className="mt-0.5 text-text-muted">{row.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.key} className="py-3 first:pt-0 last:pb-0">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-baseline gap-2">
                <p className="text-sm font-medium text-text-primary">{row.label}</p>
                <span
                  className="hidden text-[10px] uppercase tracking-[0.14em] text-text-muted md:inline"
                  title={row.hint}
                >
                  {row.hint}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {row.shiftDiff !== null && <ScoreShiftArrow diff={row.shiftDiff} />}
                <OrdinalChip result={row.ordinal} size="sm" />
              </div>
            </div>
            <p className="text-xs text-text-secondary">{row.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
