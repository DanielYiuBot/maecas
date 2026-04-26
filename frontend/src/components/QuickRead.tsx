import { ArrowDown, ArrowRight, ArrowUp, Eye, Lightbulb, MessageSquareWarning, PlusCircle } from 'lucide-react'
import type { AnalysisReport } from '../types/api'
import { toneToOrdinal } from '../lib/ordinal'

interface Props {
  report: AnalysisReport
}

interface Cell {
  key: string
  eyebrow: string
  icon: React.ReactNode
  primary: React.ReactNode
  detail: string | null
  tone: 'bull' | 'bear' | 'warn' | 'neutral'
}

const TONE_BORDER: Record<Cell['tone'], string> = {
  bull: 'border-bull-100 bg-bull-50/50',
  bear: 'border-bear-100 bg-bear-50/40',
  warn: 'border-warn-100 bg-warn-50/50',
  neutral: 'border-border bg-surface-muted/60',
}

const TONE_TEXT: Record<Cell['tone'], string> = {
  bull: 'text-bull-900',
  bear: 'text-bear-900',
  warn: 'text-warn-900',
  neutral: 'text-text-secondary',
}

function truncate(text: string, n: number): string {
  if (text.length <= n) return text
  return text.slice(0, n - 1).trimEnd() + '…'
}

function buildToneCell(report: AnalysisReport): Cell {
  const s = report.sentiment
  const avg = (s.mgmt_confidence_presentation + s.mgmt_confidence_qa) / 2
  const ordinal = toneToOrdinal(avg)
  const priorPres = s.mgmt_confidence_presentation_baseline?.prior_quarter
  const priorQA = s.mgmt_confidence_qa_baseline?.prior_quarter

  let arrow: React.ReactNode = <ArrowRight className="h-3.5 w-3.5" />
  let detail: string | null = 'No prior baseline'
  let tone: Cell['tone'] = ordinal.tone === 'bull' ? 'bull' : ordinal.tone === 'bear' ? 'bear' : ordinal.tone === 'warn' ? 'warn' : 'neutral'

  if (priorPres != null && priorQA != null) {
    const prior = (priorPres + priorQA) / 2
    const diff = avg - prior
    // Suppress arrows for noise-floor moves (|diff| < 2 on a 1-10 scale).
    if (Math.abs(diff) < 2) {
      arrow = <ArrowRight className="h-3.5 w-3.5" />
      detail = 'Within noise floor vs prior quarter'
    } else if (diff > 0) {
      arrow = <ArrowUp className="h-3.5 w-3.5" />
      tone = 'bull'
      detail = 'Meaningfully more confident vs prior quarter'
    } else {
      arrow = <ArrowDown className="h-3.5 w-3.5" />
      tone = 'bear'
      detail = 'Meaningfully more defensive vs prior quarter'
    }
  }

  return {
    key: 'tone',
    eyebrow: 'Tone',
    icon: arrow,
    primary: <span className="font-medium">{ordinal.label}</span>,
    detail,
    tone,
  }
}

function buildEvasionCell(report: AnalysisReport): Cell {
  const scores = report.sentiment.evasion_scores
  if (scores.length === 0) {
    return {
      key: 'evasion',
      eyebrow: 'Top evasion',
      icon: <MessageSquareWarning className="h-3.5 w-3.5" />,
      primary: <span className="text-text-muted">No Q&amp;A parsed</span>,
      detail: null,
      tone: 'neutral',
    }
  }
  const byTopic = new Map<string, { count: number; total: number }>()
  for (const e of scores) {
    if (e.score < 3) continue
    const k = (e.topic || 'unclassified').trim().toLowerCase()
    const prev = byTopic.get(k) ?? { count: 0, total: 0 }
    byTopic.set(k, { count: prev.count + 1, total: prev.total + e.score })
  }
  const ranked = [...byTopic.entries()]
    .map(([topic, { count, total }]) => ({ topic, count, avg: total / count }))
    .sort((a, b) => b.count - a.count || b.avg - a.avg)

  if (ranked.length === 0) {
    return {
      key: 'evasion',
      eyebrow: 'Top evasion',
      icon: <MessageSquareWarning className="h-3.5 w-3.5" />,
      primary: <span className="text-bull-900">No evasive answers</span>,
      detail: `${scores.length} analyst question${scores.length === 1 ? '' : 's'} parsed`,
      tone: 'bull',
    }
  }

  const top = ranked[0]
  return {
    key: 'evasion',
    eyebrow: 'Top evasion',
    icon: <MessageSquareWarning className="h-3.5 w-3.5" />,
    primary: <span className="capitalize">{truncate(top.topic, 28)}</span>,
    detail: `${top.count} hot Q&A · ${top.avg >= 3 ? 'heavy' : 'notable'} deflection`,
    tone: top.count >= 2 ? 'bear' : 'warn',
  }
}

function buildLanguageCell(report: AnalysisReport): Cell {
  const drift = report.delta?.language_drift
  if (!drift || drift.added_phrases.length === 0) {
    return {
      key: 'language',
      eyebrow: 'New language',
      icon: <PlusCircle className="h-3.5 w-3.5" />,
      primary: <span className="text-text-muted">No prior comparison</span>,
      detail: null,
      tone: 'neutral',
    }
  }
  const top = drift.added_phrases[0]
  const more = drift.added_phrases.length - 1
  return {
    key: 'language',
    eyebrow: 'Started saying',
    icon: <PlusCircle className="h-3.5 w-3.5" />,
    primary: <span className="font-medium">"{truncate(top, 32)}"</span>,
    detail: more > 0 ? `+${more} more new phrase${more === 1 ? '' : 's'}` : 'Sole new phrase this quarter',
    tone: 'bull',
  }
}

function buildHiddenGemCell(report: AnalysisReport): Cell {
  const gem = report.hidden_gems?.[0] ?? null
  if (!gem) {
    return {
      key: 'gem',
      eyebrow: 'Under-discussed',
      icon: <Lightbulb className="h-3.5 w-3.5" />,
      primary: <span className="text-text-muted">None surfaced</span>,
      detail: null,
      tone: 'neutral',
    }
  }
  return {
    key: 'gem',
    eyebrow: 'Under-discussed',
    icon: <Lightbulb className="h-3.5 w-3.5" />,
    primary: <span className="font-medium">{truncate(gem.statement, 64)}</span>,
    detail:
      gem.mention_count <= 1
        ? 'Single-mention thread'
        : `Mentioned ${gem.mention_count}x; not a primary signal`,
    tone: 'warn',
  }
}

export function QuickRead({ report }: Props) {
  const cells: Cell[] = [
    buildToneCell(report),
    buildEvasionCell(report),
    buildLanguageCell(report),
    buildHiddenGemCell(report),
  ]

  return (
    <div className="rounded-lg border border-border bg-surface-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Eye className="h-3.5 w-3.5 text-text-muted" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          10-second read · what only the transcript reveals
        </p>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0 lg:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.key} className={`px-4 py-3 ${TONE_BORDER[cell.tone]}`}>
            <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              <span className={TONE_TEXT[cell.tone]}>{cell.icon}</span>
              {cell.eyebrow}
            </p>
            <div className={`text-sm ${TONE_TEXT[cell.tone]}`}>{cell.primary}</div>
            {cell.detail && <p className="mt-0.5 text-[11px] text-text-muted">{cell.detail}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
