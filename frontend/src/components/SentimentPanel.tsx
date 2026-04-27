import type { EvasionScore, EvidenceCitation, QuestionQuality, SentimentProfile } from '../types/api'
import { CitationButton } from './CitationButton'
import { MethodologyTip } from './MethodologyTip'
import { ConfidenceBadge, shouldSurfaceConfidence } from '../lib/confidence'
import {
  OrdinalChip,
  ScoreShiftArrow,
  hedgingToOrdinal,
  skepticismToOrdinal,
  toneToOrdinal,
  type OrdinalResult,
} from '../lib/ordinal'

interface Props {
  sentiment: SentimentProfile
}

interface OrdinalRowProps {
  label: string
  ordinal: OrdinalResult
  shiftDiff?: number | null
  citations?: EvidenceCitation[]
}

function EvidenceRow({ citations }: { citations: EvidenceCitation[] }) {
  if (citations.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {citations.slice(0, 2).map((c, i) => (
        <CitationButton key={i} citation={c} compact />
      ))}
    </div>
  )
}

function OrdinalRow({ label, ordinal, shiftDiff, citations = [] }: OrdinalRowProps) {
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-text-secondary">{label}</span>
        <div className="flex items-center gap-2">
          {shiftDiff !== undefined && shiftDiff !== null && <ScoreShiftArrow diff={shiftDiff} />}
          <OrdinalChip result={ordinal} size="sm" />
        </div>
      </div>
      <EvidenceRow citations={citations} />
    </div>
  )
}

function QualityChip({ q }: { q: QuestionQuality }) {
  const map: Record<QuestionQuality, string> = {
    probing: 'bg-info-100 text-info-900',
    soft: 'bg-ink-100 text-text-secondary',
    clarifying: 'bg-bone-200 text-ink-700',
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${map[q]}`}>{q}</span>
  )
}

function topConcerns(evasion: EvasionScore[]): Array<{ topic: string; count: number; avgScore: number }> {
  const byTopic = new Map<string, { count: number; total: number }>()
  for (const e of evasion) {
    const key = (e.topic || 'unclassified').trim().toLowerCase()
    const prev = byTopic.get(key) ?? { count: 0, total: 0 }
    byTopic.set(key, { count: prev.count + 1, total: prev.total + e.score })
  }
  return Array.from(byTopic.entries())
    .map(([topic, { count, total }]) => ({ topic, count, avgScore: total / count }))
    .sort((a, b) => b.count - a.count || b.avgScore - a.avgScore)
    .slice(0, 3)
}

function EvasionGrid({
  evasion,
  citations,
}: {
  evasion: EvasionScore[]
  citations: EvidenceCitation[]
}) {
  // Drop score=0 rows entirely (non-evasive answers are noise on this card).
  // Replace the bold 0-5 badge with a subtle "Evasive" pill that only appears
  // when the model rated the answer as actually evasive (score >= 3). The
  // quote and reason carry the actual signal.
  const visible = evasion.filter((e) => e.score >= 1)
  if (visible.length === 0) return null

  return (
    <div className="mt-4">
      <h4 className="mb-2 text-sm font-medium text-text-secondary">
        Analyst Q&amp;A — questions where management deflected
      </h4>
      <div className="space-y-2">
        {visible.map((e, i) => {
          const isEvasive = e.score >= 3
          const pairedCitations = citations.filter((c) => c.utterance_index === e.utterance_index)
          return (
            <div
              key={i}
              className={`rounded border p-2 text-xs ${isEvasive ? 'border-bear-100 bg-bear-50/30' : 'border-border'}`}
            >
              <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                <QualityChip q={e.question_quality} />
                {isEvasive && (
                  <span
                    className="rounded border border-bear-100 bg-bear-50 px-1.5 py-0.5 text-[10px] font-medium text-bear-900"
                    title="Qualitative evasion bucket; underlying model value hidden to avoid false precision"
                  >
                    Evasive answer
                  </span>
                )}
                {e.topic && (
                  <span className="rounded bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-700">
                    {e.topic}
                  </span>
                )}
                {e.analyst_name && (
                  <span className="text-[10px] text-text-muted">· {e.analyst_name}</span>
                )}
              </div>
              <p className="line-clamp-2 font-medium text-text-primary">{e.analyst_question}</p>
              <p className="mt-0.5 text-text-muted">{e.reason}</p>
              <EvidenceRow citations={pairedCitations} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SentimentPanel({ sentiment }: Props) {
  const concerns = topConcerns(sentiment.evasion_scores)
  const presentationEvidence = sentiment.evidence_citations.filter((c) =>
    c.section.toLowerCase().includes('presentation')
  )
  const qaEvidence = sentiment.evidence_citations.filter((c) =>
    c.section.toLowerCase().includes('qa')
  )

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Language</p>
          <h3 className="maecas-title">Sentiment &amp; Analyst Intelligence</h3>
        </div>
        <span className="rounded-full bg-ink-100 px-3 py-1 text-sm font-medium text-text-secondary">
          {sentiment.register}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-secondary">Presentation</h4>
          <OrdinalRow
            label="Management confidence"
            ordinal={toneToOrdinal(sentiment.mgmt_confidence_presentation)}
            citations={presentationEvidence}
            shiftDiff={
              sentiment.mgmt_confidence_presentation_baseline?.prior_quarter != null
                ? sentiment.mgmt_confidence_presentation -
                  sentiment.mgmt_confidence_presentation_baseline.prior_quarter
                : null
            }
          />
          <OrdinalRow
            label="Hedging frequency"
            ordinal={hedgingToOrdinal(sentiment.hedging_frequency)}
            citations={presentationEvidence}
          />
        </div>
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-secondary">Q&amp;A</h4>
          <OrdinalRow
            label="Management confidence"
            ordinal={toneToOrdinal(sentiment.mgmt_confidence_qa)}
            citations={qaEvidence}
            shiftDiff={
              sentiment.mgmt_confidence_qa_baseline?.prior_quarter != null
                ? sentiment.mgmt_confidence_qa -
                  sentiment.mgmt_confidence_qa_baseline.prior_quarter
                : null
            }
          />
          <OrdinalRow
            label="Analyst skepticism"
            ordinal={skepticismToOrdinal(sentiment.analyst_skepticism)}
            citations={qaEvidence}
          />
        </div>
      </div>

      {concerns.length > 0 && (
        <div className="mt-5 rounded-lg border border-accent-100 bg-accent-50/60 p-3">
          <p className="maecas-eyebrow mb-2 text-accent-700">Top analyst concerns</p>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
            {concerns.map((c) => (
              <div key={c.topic} className="rounded border border-border bg-surface-card p-2">
                <p className="text-sm font-medium capitalize text-text-primary">{c.topic}</p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {c.count} question{c.count === 1 ? '' : 's'} · {c.avgScore >= 3 ? 'heavy' : 'notable'} deflection
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <EvasionGrid evasion={sentiment.evasion_scores} citations={qaEvidence} />

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-text-muted">
        {shouldSurfaceConfidence(sentiment.confidence) && (
          <ConfidenceBadge value={sentiment.confidence} prefix="Run confidence" />
        )}
        <span>{sentiment.confidence_rationale}</span>
        {sentiment.low_confidence_flag && (
          <span className="font-medium text-warn-900">Low-confidence run</span>
        )}
        {sentiment.score_methodology.length > 0 && (
          <MethodologyTip label="How computed" width="lg">
            <ul className="space-y-1">
              {sentiment.score_methodology.map((m) => (
                <li key={m.metric}>
                  <span className="font-semibold">{m.metric}:</span> {m.heuristic}
                </li>
              ))}
            </ul>
          </MethodologyTip>
        )}
      </div>

    </div>
  )
}
