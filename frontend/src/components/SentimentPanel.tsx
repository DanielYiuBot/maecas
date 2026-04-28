import type { EvasionScore, EvidenceCitation, SentimentProfile } from '../types/api'
import { CitationButton } from './CitationButton'
import { MethodChip } from './MethodChip'
import { SourceTag } from './SourceTag'
import { ScoreBar } from './ScoreBar'

interface Props {
  sentiment: SentimentProfile
}

interface Concern {
  topic: string
  count: number
  avgScore: number
}

function topConcerns(evasion: EvasionScore[]): Concern[] {
  const byTopic = new Map<string, { count: number; total: number }>()
  for (const e of evasion) {
    if (e.score < 3) continue
    const key = (e.topic || 'unclassified').trim().toLowerCase()
    const prev = byTopic.get(key) ?? { count: 0, total: 0 }
    byTopic.set(key, { count: prev.count + 1, total: prev.total + e.score })
  }
  return Array.from(byTopic.entries())
    .map(([topic, { count, total }]) => ({ topic, count, avgScore: total / count }))
    .sort((a, b) => b.count - a.count || b.avgScore - a.avgScore)
    .slice(0, 3)
}

function pairedCitations(evasion: EvasionScore, qaCitations: EvidenceCitation[]): EvidenceCitation[] {
  return qaCitations.filter((c) => c.utterance_index === evasion.utterance_index)
}

function normalizeTopic(topic: string | null | undefined): string {
  return (topic || 'unclassified').trim().toLowerCase()
}

function ensureEvasiveCitations(evasion: EvasionScore, qaCitations: EvidenceCitation[]): EvidenceCitation[] {
  const matched = pairedCitations(evasion, qaCitations)
  if (matched.length > 0) return matched
  return [
    {
      speaker: evasion.analyst_name || 'Analyst',
      section: 'QA',
      utterance_index: evasion.utterance_index,
      quote: evasion.analyst_question,
    },
  ]
}

function uniqueCitations(citations: EvidenceCitation[]): EvidenceCitation[] {
  const seen = new Set<string>()
  const out: EvidenceCitation[] = []
  for (const c of citations) {
    const key = `${c.utterance_index}::${c.quote}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

/** Sentiment panel — language and analyst-pressure read.
 *
 * Top:    three color ScoreBars for Tone, Hedging, and Evasion (the new
 *         in-house scorecard style: bar + numeric value + arrow + detail row).
 * Middle: analyst topic coverage (which themes drew skepticism / evasion).
 * Bottom: top evasive Q&A list, each row carrying its own citation button
 *         right beneath the question so users can jump straight into the
 *         transcript drawer. The redundant Transcript source tag has been
 *         removed — it was obvious that Q&A live in the transcript.
 */
export function SentimentPanel({ sentiment }: Props) {
  const toneAvg = (sentiment.mgmt_confidence_presentation + sentiment.mgmt_confidence_qa) / 2
  const tonePrior =
    sentiment.mgmt_confidence_presentation_baseline?.prior_quarter != null &&
    sentiment.mgmt_confidence_qa_baseline?.prior_quarter != null
      ? (sentiment.mgmt_confidence_presentation_baseline.prior_quarter +
          sentiment.mgmt_confidence_qa_baseline.prior_quarter) /
        2
      : null

  const concerns = topConcerns(sentiment.evasion_scores)
  const qaEvidence = sentiment.evidence_citations.filter((c) => c.section.toLowerCase().includes('qa'))

  const totalEvasion = sentiment.evasion_scores.length
  const hotEvasion = sentiment.evasion_scores.filter((e) => e.score >= 3).length
  const evasionLabel = totalEvasion > 0 ? `${hotEvasion}/${totalEvasion}` : '—'

  const visibleEvasive = sentiment.evasion_scores
    .filter((e) => e.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  const topicCoverageCitations = new Map<string, EvidenceCitation[]>()
  for (const e of sentiment.evasion_scores) {
    const topic = normalizeTopic(e.topic)
    const list = topicCoverageCitations.get(topic) ?? []
    list.push(...ensureEvasiveCitations(e, qaEvidence))
    topicCoverageCitations.set(topic, uniqueCitations(list))
  }

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Language</p>
          <h3 className="maecas-title">Sentiment &amp; Analyst Intelligence</h3>
          <p className="maecas-subtitle mt-0.5">
            Tone, hedging, and evasion as color-zoned bars. Evasive Q&amp;A appear below, each with quoted evidence actions.
          </p>
        </div>
        <MethodChip panel="sentiment" scoreOrBucket="Tone" />
      </div>

      <div className="divide-y divide-border">
        <ScoreBar
          label="Tone"
          description="avg of management confidence in presentation + Q&A"
          value={toneAvg}
          priorValue={tonePrior}
          min={1}
          max={10}
          polarity="higher_is_better"
          detail={
            <>
              Pres {sentiment.mgmt_confidence_presentation}/10 · Q&amp;A {sentiment.mgmt_confidence_qa}/10
              {tonePrior != null && <span> · prior avg {tonePrior.toFixed(1)}</span>}
            </>
          }
        />
        <ScoreBar
          label="Hedging"
          description="frequency of qualifier words. lower is more direct"
          value={sentiment.hedging_frequency}
          min={1}
          max={10}
          polarity="higher_is_concerning"
          detail={`Hedge score ${sentiment.hedging_frequency}/10`}
        />
        <ScoreBar
          label="Evasion index"
          description="Q&A answers with evasion score >= 3"
          value={hotEvasion}
          max={Math.max(1, totalEvasion)}
          polarity="higher_is_concerning"
          valueLabel={evasionLabel}
          detail={
            concerns.length > 0
              ? `Top topic: ${concerns[0].topic}`
              : totalEvasion === 0
                ? 'No analyst questions parsed'
                : 'No evasive answers flagged'
          }
        />
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

      {visibleEvasive.length > 0 && (
        <div className="mt-5 rounded-lg border border-bear-100 bg-bear-50/15 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-bear-900">
            Evasive Q&amp;A
            <span className="ml-2 text-[10px] font-normal text-text-muted">
              (top {visibleEvasive.length} of {totalEvasion})
            </span>
          </p>
          <div className="space-y-2">
            {visibleEvasive.map((e, i) => {
              const cits = ensureEvasiveCitations(e, qaEvidence)
              return (
                <div key={i} className="rounded border border-bear-100 bg-bear-50/40 p-2 text-xs">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    {e.topic && (
                      <span className="rounded border border-accent-100 bg-accent-50 px-1.5 py-0.5 text-[10px] text-accent-700">
                        {e.topic}
                      </span>
                    )}
                    {e.analyst_name && <span className="text-[10px] text-text-muted">· {e.analyst_name}</span>}
                  </div>
                  <p className="line-clamp-2 font-medium text-text-primary">{e.analyst_question}</p>
                  <p className="mt-0.5 text-text-muted">{e.reason}</p>
                  {cits.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Quoted evidence</p>
                      {cits.map((c, ci) => (
                        <CitationButton key={ci} citation={c} label="Quoted evidence" />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {sentiment.analyst_topic_map && sentiment.analyst_topic_map.length > 0 && (
        <div className="mt-4 rounded border border-border bg-surface-card p-3">
          <h4 className="mb-2 text-sm font-medium text-text-secondary">Analyst topic coverage</h4>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {sentiment.analyst_topic_map.slice(0, 6).map((row) => (
              <div key={row.topic} className="rounded border border-border bg-surface-muted/60 p-2 text-xs">
                <p className="font-medium capitalize text-text-primary">{row.topic}</p>
                <p className="text-text-muted">
                  {row.question_count} question{row.question_count === 1 ? '' : 's'} · {row.answer_quality}
                </p>
                {(() => {
                  const cits = topicCoverageCitations.get(normalizeTopic(row.topic)) ?? []
                  if (cits.length === 0) return null
                  return (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Quoted evidence</p>
                      {cits.map((c, i) => (
                        <CitationButton key={i} citation={c} label="Quoted evidence" />
                      ))}
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
