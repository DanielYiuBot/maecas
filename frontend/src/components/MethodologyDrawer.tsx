import { useEffect, useMemo, useRef } from 'react'
import { Cpu, Hash, Info, Layers, ShieldAlert, X } from 'lucide-react'
import type { MethodologyEntry, PanelKey } from '../types/api'
import { useMethodology } from '../context/MethodologyContext'
import { SourceTag } from './SourceTag'

const PANEL_LABEL: Record<PanelKey, string> = {
  decision: 'Decision',
  summary: 'Summary',
  lseg: 'LSEG & Financials',
  sentiment: 'Sentiment',
  qoq: 'QoQ change',
  guidance: 'Guidance',
}

function EntryCard({ entry, highlight }: { entry: MethodologyEntry; highlight: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight ? 'border-accent-500 bg-accent-50/60' : 'border-border bg-surface-card'
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-text-primary">{entry.score_or_bucket}</h4>
        <SourceTag source={entry.source} />
        {entry.is_llm ? (
          <span
            className="inline-flex items-center gap-1 rounded border border-info-100 bg-info-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-info-900"
            title="Produced by an LLM call"
          >
            <Cpu className="h-3 w-3" /> LLM
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded border border-ink-200 bg-ink-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-secondary"
            title="Produced by deterministic computation"
          >
            <Hash className="h-3 w-3" /> Deterministic
          </span>
        )}
      </div>

      <div className="mb-2 text-xs text-text-secondary">
        <span className="font-semibold text-text-primary">Produced by:</span>{' '}
        <span className="font-mono">{entry.produced_by}</span>
      </div>

      {entry.prompt_summary && (
        <div className="mb-2 rounded border border-border bg-surface-muted/50 p-2 text-xs text-text-primary">
          {entry.prompt_summary}
        </div>
      )}

      {entry.bucket_cutoffs && (
        <div className="mb-2 flex items-start gap-1.5 text-xs text-text-secondary">
          <Layers className="mt-0.5 h-3 w-3 text-text-muted" />
          <span>
            <span className="font-semibold text-text-primary">Cutoffs:</span> {entry.bucket_cutoffs}
          </span>
        </div>
      )}

      {entry.inputs.length > 0 && (
        <div className="mb-2 text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">Inputs:</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {entry.inputs.map((i) => (
              <code key={i} className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                {i}
              </code>
            ))}
          </div>
        </div>
      )}

      {entry.raw_score !== null && entry.raw_score !== undefined && (
        <div className="mb-2 text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">Raw score (audit-only):</span>{' '}
          <span className="font-mono">{entry.raw_score.toFixed(2)}</span>
          <span className="ml-1 italic text-text-muted">— hidden from dashboard surface to avoid false precision.</span>
        </div>
      )}

      {entry.caveats.length > 0 && (
        <div className="mt-2 rounded border border-warn-100 bg-warn-50/60 p-2">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-warn-900">
            <ShieldAlert className="h-3 w-3" /> Caveats
          </p>
          <ul className="space-y-0.5 text-xs text-warn-900">
            {entry.caveats.map((c, i) => (
              <li key={i}>· {c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function MethodologyDrawer() {
  const { entries, active, close } = useMethodology()
  const activeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, close])

  useEffect(() => {
    if (active && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [active])

  const grouped = useMemo(() => {
    const m = new Map<PanelKey, MethodologyEntry[]>()
    for (const e of entries) {
      const list = m.get(e.panel) ?? []
      list.push(e)
      m.set(e.panel, list)
    }
    return m
  }, [entries])

  if (!active) return null

  return (
    <div className="fixed inset-0 z-40" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-ink-950/30 backdrop-blur-[2px]" onClick={close} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col border-l border-border bg-surface-card shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="maecas-eyebrow flex items-center gap-1">
              <Info className="h-3 w-3" /> Methodology
            </p>
            <h3 className="maecas-title">How this score was produced</h3>
            <p className="maecas-subtitle mt-0.5">
              Per-panel audit trail. Raw model numbers stay here; the dashboard keeps a distilled view with selected chips, bars, and citations.
            </p>
          </div>
          <button
            onClick={close}
            className="rounded-md border border-border p-1.5 text-text-muted transition hover:bg-surface-muted hover:text-text-primary"
            aria-label="Close methodology drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {entries.length === 0 && (
            <p className="text-sm text-text-muted">
              Methodology payload was not stored with this analysis. Re-run the pipeline to populate it.
            </p>
          )}

          {Array.from(grouped.entries()).map(([panel, list]) => (
            <section key={panel}>
              <p className="maecas-eyebrow mb-2">{PANEL_LABEL[panel]}</p>
              <div className="space-y-2">
                {list.map((entry) => {
                  const isActive =
                    panel === active.panel &&
                    (active.scoreOrBucket == null || active.scoreOrBucket === entry.score_or_bucket)
                  return (
                    <div key={`${entry.panel}-${entry.score_or_bucket}`} ref={isActive ? activeRef : null}>
                      <EntryCard entry={entry} highlight={isActive} />
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className="border-t border-border px-5 py-3 text-[11px] text-text-muted">
          Source tags: <span className="font-semibold text-info-900">LSEG</span> = objective market data ·{' '}
          <span className="font-semibold text-text-secondary">Transcript</span> = stated by management with a citation ·{' '}
          <span className="font-semibold text-warn-900">Synthesis</span> = LLM combined the two (treat with care).
        </footer>
      </aside>
    </div>
  )
}
