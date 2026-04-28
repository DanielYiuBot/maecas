import { Quote } from 'lucide-react'
import type { EvidenceCitation } from '../types/api'
import { useTranscript } from '../context/TranscriptContext'

interface Props {
  citation: EvidenceCitation
  compact?: boolean
  className?: string
  label?: string
}

export function CitationButton({ citation, compact = false, className = '', label }: Props) {
  const { openCitation } = useTranscript()

  return (
    <button
      type="button"
      onClick={() => openCitation(citation)}
      className={`inline-flex items-start gap-1.5 rounded border border-border px-2 py-1 text-left text-xs text-text-secondary transition hover:border-accent-500 hover:bg-accent-50 hover:text-accent-900 ${className}`}
      title="Click to view transcript context"
    >
      <Quote className="mt-0.5 h-3 w-3 shrink-0 text-text-muted" />
      <span className={compact ? 'line-clamp-1' : 'line-clamp-2'}>
        {label && <span className="mr-1 font-semibold uppercase tracking-wide text-[10px] text-accent-700">{label}</span>}
        <span className="font-medium text-text-primary">{citation.speaker}</span>
        <span className="text-text-muted"> · {citation.section} #{citation.utterance_index}</span>
        {!compact && (
          <>
            <br />
            <span className="italic">&ldquo;{citation.quote.slice(0, 140)}{citation.quote.length > 140 ? '…' : ''}&rdquo;</span>
          </>
        )}
      </span>
    </button>
  )
}
