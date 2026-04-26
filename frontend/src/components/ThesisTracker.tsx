import { History, RotateCcw, Zap } from 'lucide-react'
import type { CoreThesis, PriorThesisEntry, ThesisMemory, ThesisEvolution, ThesisOutcome } from '../types/api'

interface Props {
  memory: ThesisMemory | null
  currentThesis: CoreThesis | null
}

const EVOLUTION_STYLES: Record<ThesisEvolution, { label: string; className: string; icon: React.ReactNode }> = {
  new: {
    label: 'New coverage',
    className: 'bg-info-100 text-info-900 border-info-100',
    icon: <Zap className="h-3.5 w-3.5" />,
  },
  evolved: {
    label: 'Thesis evolved',
    className: 'bg-warn-50 text-warn-900 border-warn-100',
    icon: <History className="h-3.5 w-3.5" />,
  },
  reversed: {
    label: 'Thesis reversed',
    className: 'bg-bear-50 text-bear-900 border-bear-100',
    icon: <RotateCcw className="h-3.5 w-3.5" />,
  },
  reinforced: {
    label: 'Reinforced',
    className: 'bg-bull-50 text-bull-900 border-bull-100',
    icon: <History className="h-3.5 w-3.5" />,
  },
}

const DECISION_STYLES: Record<string, string> = {
  Buy: 'bg-bull-100 text-bull-900',
  Monitor: 'bg-warn-100 text-warn-900',
  Avoid: 'bg-bear-100 text-bear-900',
}

const OUTCOME_STYLES: Record<ThesisOutcome, string> = {
  confirmed: 'bg-bull-50 text-bull-900 border-bull-100',
  falsified: 'bg-bear-50 text-bear-900 border-bear-100',
  open: 'bg-warn-50 text-warn-900 border-warn-100',
  unknown: 'bg-ink-100 text-text-secondary border-ink-200',
}

function fmtReturn(value: number | null | undefined, window?: string | null): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}%${window ? ` ${window}` : ''}`
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'if', 'as', 'at',
  'on', 'in', 'of', 'for', 'to', 'from', 'by', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'it', 'its', 'this', 'that',
  'these', 'those', 'we', 'our', 'us', 'you', 'your', 'they', 'them',
  'their', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would',
  'should', 'could', 'may', 'might', 'can',
])

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  )
}

function jaccard(a: string, b: string): number {
  const sa = tokenize(a)
  const sb = tokenize(b)
  if (sa.size === 0 && sb.size === 0) return 1
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

interface CondensedEntry {
  kind: 'detail' | 'collapsed'
  prior: PriorThesisEntry | null
  collapsedCount?: number
}

const SIMILARITY_THRESHOLD = 0.6
const MAX_DETAIL_NODES = 4

/**
 * The memory agent emits a generic load-count rationale when no orchestrator
 * analysis has overwritten it ("Loaded N prior coverage entries…", or the older
 * "Found N prior analyses; evolution will be refined post-signal extraction.").
 * Both leak engineering language into the user surface and tell the user
 * nothing about the thesis evolution. Hide them so the panel only shows a
 * rationale when the orchestrator filled in a substantive one.
 */
function isPlaceholderRationale(text: string): boolean {
  const t = text.toLowerCase()
  return (
    t.startsWith('loaded ') && t.includes('prior coverage entries')
  ) || (
    t.startsWith('found ') && t.includes('prior analyses')
  ) || t === 'no prior coverage for this ticker.'
}

/**
 * Collapse runs of consecutive prior theses where decision/conviction did not
 * change AND the one-liner restates the same idea (Jaccard > 0.6) into a
 * single "+N similar prior theses" footer node. Beyond MAX_DETAIL_NODES total
 * detail rows we collapse the rest as well, so a six-quarter run of
 * "NVIDIA is pivoting / decoupling / evolving" reads as one cluster instead
 * of six near-identical cards.
 */
function condense(priors: PriorThesisEntry[]): CondensedEntry[] {
  if (priors.length === 0) return []

  const out: CondensedEntry[] = []
  let detailCount = 0
  let pendingCollapsed = 0
  let lastKept: PriorThesisEntry | null = null

  const flushCollapsed = () => {
    if (pendingCollapsed > 0) {
      out.push({ kind: 'collapsed', prior: null, collapsedCount: pendingCollapsed })
      pendingCollapsed = 0
    }
  }

  for (const p of priors) {
    const sameDecision = lastKept != null && lastKept.decision === p.decision && lastKept.conviction === p.conviction
    const restated = lastKept != null && jaccard(lastKept.one_liner, p.one_liner) >= SIMILARITY_THRESHOLD
    const shouldCollapse = sameDecision && restated

    if (shouldCollapse || detailCount >= MAX_DETAIL_NODES) {
      pendingCollapsed += 1
      continue
    }

    flushCollapsed()
    out.push({ kind: 'detail', prior: p })
    lastKept = p
    detailCount += 1
  }
  flushCollapsed()
  return out
}

export function ThesisTracker({ memory, currentThesis }: Props) {
  if (!memory) return null

  const evo = EVOLUTION_STYLES[memory.thesis_evolution]
  const condensed = condense(memory.prior_theses)
  const totalCollapsed = condensed
    .filter((c) => c.kind === 'collapsed')
    .reduce((acc, c) => acc + (c.collapsedCount ?? 0), 0)

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Cross-quarter memory</p>
          <h3 className="maecas-title">Thesis Tracker</h3>
          <p className="maecas-subtitle mt-0.5">
            Only theses where decision, conviction, or framing actually shifted are expanded.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${evo.className}`}
        >
          {evo.icon}
          {evo.label}
        </span>
      </div>

      {memory.evolution_rationale && !isPlaceholderRationale(memory.evolution_rationale) && (
        <p className="mb-4 text-xs text-text-secondary">{memory.evolution_rationale}</p>
      )}

      <div className="relative border-l border-border pl-6">
        {currentThesis && (
          <div className="relative mb-4">
            <span className="absolute -left-[29px] top-2 flex h-3 w-3 items-center justify-center">
              <span className="h-3 w-3 rounded-full border-2 border-accent-500 bg-accent-500" />
            </span>
            <div className="rounded-lg border border-accent-500 bg-accent-50/80 p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-700">
                  This quarter
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold ${DECISION_STYLES[currentThesis.decision] ?? ''}`}
                >
                  {currentThesis.decision}
                </span>
                <span className="text-[11px] text-text-muted">
                  {currentThesis.conviction} conviction · {currentThesis.time_horizon}
                </span>
              </div>
              <p className="text-sm font-medium text-text-primary">{currentThesis.one_liner}</p>
            </div>
          </div>
        )}

        {memory.prior_theses.length === 0 && (
          <div className="py-2 text-sm text-text-muted">
            No prior analyses for this ticker yet. Subsequent runs will show thesis evolution here.
          </div>
        )}

        {condensed.map((entry, i) =>
          entry.kind === 'detail' && entry.prior ? (
            <div key={`d${i}`} className="relative mb-4 last:mb-0">
              <span className="absolute -left-[28px] top-2 flex h-3 w-3 items-center justify-center">
                <span className="h-2 w-2 rounded-full bg-ink-300" />
              </span>
              <div className="rounded-lg border border-border bg-surface-muted/60 p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono text-text-secondary">
                    {entry.prior.event_date?.split('T')[0] ?? entry.prior.event_date}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${DECISION_STYLES[entry.prior.decision] ?? ''}`}
                  >
                    {entry.prior.decision}
                  </span>
                  <span className="text-[11px] text-text-muted">{entry.prior.conviction} conviction</span>
                </div>
                <p className="text-sm text-text-primary">{entry.prior.one_liner}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      OUTCOME_STYLES[entry.prior.thesis_outcome ?? 'unknown']
                    }`}
                  >
                    {entry.prior.thesis_outcome ?? 'unknown'}
                  </span>
                  {fmtReturn(entry.prior.post_earnings_return_pct, entry.prior.post_earnings_window) && (
                    <span className="rounded bg-surface-card px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                      {fmtReturn(entry.prior.post_earnings_return_pct, entry.prior.post_earnings_window)}
                    </span>
                  )}
                  {entry.prior.outcome_rationale && (
                    <span className="text-[10px] text-text-muted">{entry.prior.outcome_rationale}</span>
                  )}
                </div>
                {entry.prior.primary_signal_ids.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {entry.prior.primary_signal_ids.slice(0, 5).map((id) => (
                      <span key={id} className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                        {id}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div key={`c${i}`} className="relative mb-4 last:mb-0">
              <span className="absolute -left-[28px] top-2 flex h-3 w-3 items-center justify-center">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-200" />
              </span>
              <p className="text-xs italic text-text-muted">
                +{entry.collapsedCount} earlier prior thes{(entry.collapsedCount ?? 0) === 1 ? 'is' : 'es'} restating the same view (collapsed)
              </p>
            </div>
          ),
        )}

        {totalCollapsed > 0 && memory.prior_theses.length > 0 && (
          <p className="mt-2 text-[11px] text-text-muted">
            Showing {memory.prior_theses.length - totalCollapsed} of {memory.prior_theses.length} prior theses with non-trivial deltas.
          </p>
        )}
      </div>
    </div>
  )
}
