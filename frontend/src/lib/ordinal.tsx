import type { ReactNode } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Minus } from 'lucide-react'

export type OrdinalTone = 'bull' | 'bear' | 'warn' | 'neutral'
export type DirectionIcon = 'up' | 'down' | 'flat' | 'none'

export interface OrdinalResult {
  label: string
  tone: OrdinalTone
  direction: DirectionIcon
  /** Original numeric value retained for internal bucketing only; do not render it. */
  raw: number | null
  /** Short, plain-English explanation of what the bucket means. */
  explanation: string
  intensity?: 'standard' | 'strong'
}

const TONE_CLASS: Record<OrdinalTone, string> = {
  bull: 'bg-bull-50 text-bull-900 border-bull-100',
  bear: 'bg-bear-50 text-bear-900 border-bear-100',
  warn: 'bg-warn-50 text-warn-900 border-warn-100',
  neutral: 'bg-ink-100 text-text-secondary border-ink-200',
}

function withRaw(raw: number | null, explanation: string): string {
  if (raw === null || raw === undefined || Number.isNaN(raw)) {
    return `${explanation}; no model output available`
  }
  return `${explanation}; raw model output hidden to avoid false precision`
}

/** 1-10 management-confidence score from the sentiment agent. */
export function toneToOrdinal(score: number | null | undefined): OrdinalResult {
  const v = typeof score === 'number' ? score : null
  if (v === null || Number.isNaN(v)) {
    return { label: 'Unscored', tone: 'neutral', direction: 'none', raw: null, explanation: 'No tone score' }
  }
  if (v >= 7) return { label: 'Confident', tone: 'bull', direction: 'none', raw: v, explanation: 'Tone reads as confident' }
  if (v >= 4) return { label: 'Mixed', tone: 'warn', direction: 'none', raw: v, explanation: 'Tone reads as mixed' }
  return { label: 'Defensive', tone: 'bear', direction: 'none', raw: v, explanation: 'Tone reads as defensive' }
}

/** 1-10 hedging-frequency score. Higher = more hedging (bearish). */
export function hedgingToOrdinal(score: number | null | undefined): OrdinalResult {
  const v = typeof score === 'number' ? score : null
  if (v === null || Number.isNaN(v)) {
    return { label: 'Unscored', tone: 'neutral', direction: 'none', raw: null, explanation: 'No hedging score' }
  }
  if (v <= 3) return { label: 'Direct', tone: 'bull', direction: 'none', raw: v, explanation: 'Few qualifier words' }
  if (v <= 6) return { label: 'Some hedging', tone: 'warn', direction: 'none', raw: v, explanation: 'Moderate qualifier-word density' }
  return { label: 'Heavy hedging', tone: 'bear', direction: 'none', raw: v, explanation: 'High qualifier-word density' }
}

/** 1-10 analyst-skepticism score. Higher = analysts pushing harder. */
export function skepticismToOrdinal(score: number | null | undefined): OrdinalResult {
  const v = typeof score === 'number' ? score : null
  if (v === null || Number.isNaN(v)) {
    return { label: 'Unscored', tone: 'neutral', direction: 'none', raw: null, explanation: 'No skepticism score' }
  }
  if (v <= 3) return { label: 'Soft Q&A', tone: 'bull', direction: 'none', raw: v, explanation: 'Analysts not pushing back hard' }
  if (v <= 6) return { label: 'Standard Q&A', tone: 'warn', direction: 'none', raw: v, explanation: 'Typical analyst questioning' }
  return { label: 'Hostile Q&A', tone: 'bear', direction: 'none', raw: v, explanation: 'Analysts pushing back hard' }
}

/** 0-1 ratio (e.g. share of evasive answers, share of concrete guidance). */
export function densityToOrdinal(
  ratio: number | null | undefined,
  options: { positiveIsGood?: boolean } = { positiveIsGood: false },
): OrdinalResult {
  const v = typeof ratio === 'number' ? ratio : null
  if (v === null || Number.isNaN(v)) {
    return { label: 'Unscored', tone: 'neutral', direction: 'none', raw: null, explanation: 'No density score' }
  }
  const positiveIsGood = options.positiveIsGood ?? false
  if (v >= 0.5) {
    return {
      label: 'Heavy',
      tone: positiveIsGood ? 'bull' : 'bear',
      direction: 'none',
      raw: v,
      explanation: positiveIsGood ? 'High concentration (favourable)' : 'High concentration (concerning)',
    }
  }
  if (v >= 0.2) {
    return { label: 'Notable', tone: 'warn', direction: 'none', raw: v, explanation: 'Moderate concentration' }
  }
  return {
    label: 'Light',
    tone: positiveIsGood ? 'bear' : 'bull',
    direction: 'none',
    raw: v,
    explanation: positiveIsGood ? 'Low concentration (weak signal)' : 'Low concentration (clean)',
  }
}

/** -1..+1 sentiment delta vs prior quarter. Centred bucket gets a "noise floor". */
export function deltaToOrdinal(delta: number | null | undefined): OrdinalResult {
  const v = typeof delta === 'number' ? delta : null
  if (v === null || Number.isNaN(v)) {
    return { label: 'No prior', tone: 'neutral', direction: 'none', raw: null, explanation: 'No baseline to compare against' }
  }
  if (v >= 0.6) return { label: 'Much more positive', tone: 'bull', direction: 'up', raw: v, explanation: 'Tone moved strongly more positive than prior quarter', intensity: 'strong' }
  if (v >= 0.25) return { label: 'More positive', tone: 'bull', direction: 'up', raw: v, explanation: 'Tone clearly more positive than prior quarter', intensity: 'standard' }
  if (v <= -0.6) return { label: 'Much more negative', tone: 'bear', direction: 'down', raw: v, explanation: 'Tone moved strongly more negative than prior quarter', intensity: 'strong' }
  if (v <= -0.25) return { label: 'More negative', tone: 'bear', direction: 'down', raw: v, explanation: 'Tone clearly more negative than prior quarter', intensity: 'standard' }
  return { label: 'Unchanged', tone: 'neutral', direction: 'flat', raw: v, explanation: 'Within model noise floor of prior quarter' }
}

/** 0-1 surprise gap (guidance vs consensus). */
export function surpriseGapToOrdinal(score: number | null | undefined): OrdinalResult {
  const v = typeof score === 'number' ? score : null
  if (v === null || Number.isNaN(v)) {
    return { label: 'Unknown', tone: 'neutral', direction: 'none', raw: null, explanation: 'No surprise gap computed' }
  }
  const abs = Math.abs(v)
  if (abs >= 0.5) return { label: 'Large', tone: 'warn', direction: 'none', raw: v, explanation: 'Wide gap between guidance and consensus' }
  if (abs >= 0.2) return { label: 'Notable', tone: 'warn', direction: 'none', raw: v, explanation: 'Meaningful gap between guidance and consensus' }
  return { label: 'Low', tone: 'neutral', direction: 'none', raw: v, explanation: 'Guidance broadly in line with consensus' }
}

interface OrdinalChipProps {
  result: OrdinalResult
  prefix?: string
  size?: 'sm' | 'xs'
  showDirectionIcon?: boolean
}

function DirectionGlyph({ direction, intensity }: { direction: DirectionIcon; intensity?: OrdinalResult['intensity'] }) {
  if (direction === 'up') return intensity === 'strong' ? <span>↑↑</span> : <ArrowUp className="h-3 w-3" />
  if (direction === 'down') return intensity === 'strong' ? <span>↓↓</span> : <ArrowDown className="h-3 w-3" />
  if (direction === 'flat') return <ArrowRight className="h-3 w-3" />
  return null
}

export function OrdinalChip({
  result,
  prefix,
  size = 'xs',
  showDirectionIcon = true,
}: OrdinalChipProps): ReactNode {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[10px]'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border font-medium ${sizeClass} ${TONE_CLASS[result.tone]}`}
      title={withRaw(result.raw, result.explanation)}
    >
      {prefix && <span className="uppercase tracking-wide opacity-70">{prefix}</span>}
      {showDirectionIcon && result.direction !== 'none' && <DirectionGlyph direction={result.direction} intensity={result.intensity} />}
      <span>{result.label}</span>
    </span>
  )
}

/** Helper: should we show a "vs prior" arrow at all? Suppresses model-noise-floor moves. */
export function isMeaningfulScoreShift(diff: number | null | undefined, threshold = 2): boolean {
  if (diff === null || diff === undefined || Number.isNaN(diff)) return false
  return Math.abs(diff) >= threshold
}

/** Map a `time_horizon` string ("0-3m", "3-6m", "6-12m", "12m+") to the
 * canonical Short / Medium / Long bucket used on the dashboard surface. */
export function horizonToOrdinal(value: string | null | undefined): 'Short' | 'Medium' | 'Long' | 'Unknown' {
  switch (value) {
    case '0-3m':
      return 'Short'
    case '3-6m':
    case '6-12m':
      return 'Medium'
    case '12m+':
      return 'Long'
    default:
      return 'Unknown'
  }
}

/** Render-only icon for a noise-floor-aware "vs prior" arrow on 1-10 scores. Returns null when within noise. */
export function ScoreShiftArrow({ diff }: { diff: number | null | undefined }) {
  if (!isMeaningfulScoreShift(diff)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-text-muted" title="Within model noise floor (|delta| < 2)">
        <Minus className="h-3 w-3" />
      </span>
    )
  }
  if ((diff as number) > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-bull-700" title={`+${(diff as number).toFixed(0)} vs prior quarter`}>
        <ArrowUp className="h-3 w-3" />
        {(diff as number).toFixed(0)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-bear-700" title={`${(diff as number).toFixed(0)} vs prior quarter`}>
      <ArrowDown className="h-3 w-3" />
      {(diff as number).toFixed(0)}
    </span>
  )
}
