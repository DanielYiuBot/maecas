import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { EvidenceCitation, Utterance } from '../types/api'

interface TranscriptCtx {
  utterances: Utterance[]
  activeIndex: number | null
  activeCitation: EvidenceCitation | null
  openCitation: (cit: EvidenceCitation) => void
  close: () => void
}

const Ctx = createContext<TranscriptCtx | null>(null)

interface ProviderProps {
  utterances: Utterance[]
  children: ReactNode
}

export function TranscriptProvider({ utterances, children }: ProviderProps) {
  const [activeCitation, setActiveCitation] = useState<EvidenceCitation | null>(null)

  const openCitation = useCallback((cit: EvidenceCitation) => setActiveCitation(cit), [])
  const close = useCallback(() => setActiveCitation(null), [])

  const value = useMemo<TranscriptCtx>(
    () => ({
      utterances,
      activeIndex: activeCitation?.utterance_index ?? null,
      activeCitation,
      openCitation,
      close,
    }),
    [utterances, activeCitation, openCitation, close]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTranscript(): TranscriptCtx {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error('useTranscript must be used inside <TranscriptProvider>')
  }
  return ctx
}
