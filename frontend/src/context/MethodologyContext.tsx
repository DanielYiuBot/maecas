import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { MethodologyEntry, PanelKey } from '../types/api'

interface MethodologyTarget {
  panel: PanelKey
  scoreOrBucket?: string
}

interface MethodologyCtx {
  entries: MethodologyEntry[]
  active: MethodologyTarget | null
  open: (target: MethodologyTarget) => void
  close: () => void
}

const Ctx = createContext<MethodologyCtx | null>(null)

interface ProviderProps {
  entries: MethodologyEntry[]
  children: ReactNode
}

/**
 * Holds the per-panel methodology payload (`report.methodology`) and the
 * currently-open drawer target. Mirrors the shape of TranscriptContext so
 * any panel can call `open({ panel, scoreOrBucket })` from a MethodChip.
 */
export function MethodologyProvider({ entries, children }: ProviderProps) {
  const [active, setActive] = useState<MethodologyTarget | null>(null)

  const open = useCallback((target: MethodologyTarget) => setActive(target), [])
  const close = useCallback(() => setActive(null), [])

  const value = useMemo<MethodologyCtx>(
    () => ({ entries, active, open, close }),
    [entries, active, open, close],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useMethodology(): MethodologyCtx {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error('useMethodology must be used inside <MethodologyProvider>')
  }
  return ctx
}
