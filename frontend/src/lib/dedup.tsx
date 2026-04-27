import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react'

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'if', 'as', 'at',
  'on', 'in', 'of', 'for', 'to', 'from', 'by', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'it', 'its', 'this', 'that',
  'these', 'those', 'we', 'our', 'us', 'you', 'your', 'they', 'them',
  'their', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would',
  'should', 'could', 'may', 'might', 'can',
])

/** Shared fingerprint logic for suppressing repeated dashboard facts. */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  )
}

export function jaccardSimilarity(a: string, b: string): number {
  const sa = tokenize(a)
  const sb = tokenize(b)
  if (sa.size === 0 && sb.size === 0) return 1
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

export const DEFAULT_SIMILARITY_THRESHOLD = 0.55

interface RegisteredFact {
  text: string
  source: string
}

export interface DedupRegistry {
  /** Mark a fact as shown by `source`. Idempotent — duplicate registrations are no-ops. */
  register: (text: string, source: string) => void
  /** True if a similar fact (Jaccard >= threshold) has already been registered by an earlier source. */
  isShown: (text: string, threshold?: number) => boolean
  /** Returns the source string of the first card that registered a similar fact, or null. */
  shownBy: (text: string, threshold?: number) => string | null
}

const NOOP_REGISTRY: DedupRegistry = {
  register: () => undefined,
  isShown: () => false,
  shownBy: () => null,
}

const DedupRegistryContext = createContext<DedupRegistry>(NOOP_REGISTRY)

interface DedupRegistryProviderProps {
  children: ReactNode
}

/**
 * Provides a render-scoped registry that lets cards declare which facts they
 * displayed and lets later cards suppress restating them. Render order in the
 * dashboard is the dedup order — whatever component runs first "wins" the
 * right to surface a fact.
 *
 * The registry uses a `useRef` Set rather than `useState` because we don't
 * want adding a fact to trigger a re-render — facts are written during the
 * render pass and read by sibling/descendant components in the same pass.
 */
export function DedupRegistryProvider({ children }: DedupRegistryProviderProps) {
  const factsRef = useRef<RegisteredFact[]>([])
  // Reset on every fresh render of the provider's children. Cheap because
  // dedup is small (dozens of facts). Without this, switching between reports
  // would carry state across analyses.
  factsRef.current = []

  const register = useCallback((text: string, source: string) => {
    if (!text || !text.trim()) return
    const trimmed = text.trim()
    if (factsRef.current.some((f) => f.text === trimmed && f.source === source)) return
    factsRef.current.push({ text: trimmed, source })
  }, [])

  const shownBy = useCallback((text: string, threshold = DEFAULT_SIMILARITY_THRESHOLD): string | null => {
    if (!text || !text.trim()) return null
    const trimmed = text.trim()
    for (const f of factsRef.current) {
      if (f.text === trimmed) return f.source
      if (jaccardSimilarity(f.text, trimmed) >= threshold) return f.source
    }
    return null
  }, [])

  const isShown = useCallback((text: string, threshold = DEFAULT_SIMILARITY_THRESHOLD): boolean => {
    return shownBy(text, threshold) !== null
  }, [shownBy])

  const value = useMemo(() => ({ register, isShown, shownBy }), [register, isShown, shownBy])

  return <DedupRegistryContext.Provider value={value}>{children}</DedupRegistryContext.Provider>
}

export function useDedup(): DedupRegistry {
  return useContext(DedupRegistryContext)
}
