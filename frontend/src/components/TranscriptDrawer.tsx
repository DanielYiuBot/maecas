import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { useTranscript } from '../context/TranscriptContext'

export function TranscriptDrawer() {
  const { utterances, activeIndex, activeCitation, close } = useTranscript()

  useEffect(() => {
    if (activeCitation == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeCitation, close])

  const window7 = useMemo(() => {
    if (activeIndex == null || utterances.length === 0) return []
    const start = Math.max(0, activeIndex - 2)
    const end = Math.min(utterances.length, activeIndex + 3)
    return utterances.slice(start, end)
  }, [activeIndex, utterances])

  if (activeCitation == null) return null

  return (
    <div className="fixed inset-0 z-40" aria-modal="true" role="dialog">
      <div
        className="absolute inset-0 bg-ink-950/30 backdrop-blur-[2px]"
        onClick={close}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-border bg-surface-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="maecas-eyebrow">Transcript</p>
            <h3 className="maecas-title">Source quote</h3>
          </div>
          <button
            onClick={close}
            className="rounded-md border border-border p-1.5 text-text-muted transition hover:bg-surface-muted hover:text-text-primary"
            aria-label="Close transcript drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {utterances.length === 0 && (
            <p className="text-sm text-text-muted">
              Transcript utterances were not stored with this analysis. Re-run the pipeline to enable click-to-quote.
            </p>
          )}
          {window7.map((u) => {
            const isActive = u.index === activeIndex
            return (
              <div
                key={u.index}
                className={`rounded-lg border p-3 ${
                  isActive
                    ? 'border-accent-500 bg-accent-50'
                    : 'border-border bg-surface-muted/60'
                }`}
              >
                <div className="mb-1 flex items-center gap-2 text-xs text-text-muted">
                  <span className="font-mono">#{u.index}</span>
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 font-medium text-text-secondary">
                    {u.speaker_role}
                  </span>
                  <span className="font-medium text-text-secondary">{u.speaker_name}</span>
                  <span className="text-text-muted">· {u.section}</span>
                </div>
                <p className={`text-sm leading-relaxed ${isActive ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                  {u.text}
                </p>
              </div>
            )
          })}
          {window7.length === 0 && utterances.length > 0 && (
            <p className="text-sm text-text-muted">
              No utterance with index {activeIndex} was found in the stored transcript.
            </p>
          )}
        </div>
        <footer className="border-t border-border px-5 py-3 text-xs text-text-muted">
          Citing quote: &ldquo;{activeCitation.quote}&rdquo;
        </footer>
      </aside>
    </div>
  )
}
