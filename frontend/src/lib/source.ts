import type { SourceTag } from '../types/api'

interface SourceMeta {
  label: string
  className: string
  /** When null, the SourceTag chip renders without a hover tooltip. */
  defaultExplanation: string | null
}

/** Precise tooltip text for `LSEG` chips so the user knows exactly which
 * LSEG block backs the bullet. Pick a kind at the call site, e.g.
 * `<SourceTag source="LSEG" lsegKind="consensus" />`. */
export type LsegKind =
  | 'consensus'
  | 'surprise'
  | 'fundamentals'
  | 'price_window'
  | 'instrument'

const LSEG_KIND_TEXT: Record<LsegKind, string> = {
  consensus: 'lseg consensus estimates (eps / revenue / ebitda mean) for the event-aligned period.',
  surprise: 'lseg actual vs mean estimate, including surprise % and standardized unexpected earnings.',
  fundamentals: 'lseg fundamentals — historical revenue and other reported figures.',
  price_window: 'lseg price window data around the event date.',
  instrument: 'lseg instrument metadata (ric, exchange, company name).',
}

/** One color per SourceTag, used everywhere on the dashboard so users can
 * tell at a glance whether a bullet is anchored on objective LSEG data,
 * stated by management with a citation, or LLM-deduced.
 *
 * - LSEG       -> info-blue (objective market data); tooltip narrows to
 *                 the specific LSEG block (consensus, surprise, fundamentals…).
 * - Transcript -> ink-slate (stated by management with a citation). No
 *                 tooltip — the chip's meaning is self-evident.
 * - Synthesis  -> warn-amber (LLM combined the two; visually demoted).
 */
export const SOURCE_META: Record<SourceTag, SourceMeta> = {
  LSEG: {
    label: 'LSEG',
    className: 'border-info-100 bg-info-100 text-info-900',
    defaultExplanation: 'objective market data sourced from lseg.',
  },
  Transcript: {
    label: 'Transcript',
    className: 'border-ink-200 bg-ink-100 text-text-secondary',
    defaultExplanation: null,
  },
  Synthesis: {
    label: 'Synthesis',
    className: 'border-warn-100 bg-warn-50 text-warn-900',
    defaultExplanation:
      'llm inference combining lseg numbers with transcript context. treat with more caution than a directly cited quote.',
  },
}

export function sourceMeta(source: SourceTag | null | undefined, lsegKind?: LsegKind): {
  label: string
  className: string
  explanation: string | null
} {
  const base = SOURCE_META[source ?? 'Synthesis']
  const explanation =
    source === 'LSEG' && lsegKind ? LSEG_KIND_TEXT[lsegKind] : base.defaultExplanation
  return { label: base.label, className: base.className, explanation }
}
