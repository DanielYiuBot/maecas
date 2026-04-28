import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'

export type ScorePolarity = 'higher_is_better' | 'higher_is_concerning'

interface Props {
  /** Bold metric name on the left (e.g. "Tone"). */
  label: ReactNode
  /** Subtle muted-uppercase description rendered next to the label. */
  description?: ReactNode
  /** Current score on the bar's domain. */
  value: number | null | undefined
  /** Min/max of the bar's domain. Defaults to 0..10. */
  min?: number
  max?: number
  /** Higher = bull-positive vs higher = bear-concerning. Drives the bar color. */
  polarity?: ScorePolarity
  /** Optional prior value used to draw the up/down arrow. Suppressed within
   * `noiseFloor` of zero to avoid arrowing model jitter. */
  priorValue?: number | null | undefined
  noiseFloor?: number
  /** Optional pre-formatted value string. Defaults to `${value}/${max}`. */
  valueLabel?: string
  /** Optional detail row below the bar (e.g. "Pres 9/10 · Q&A 8/10 · prior avg 9.0"). */
  detail?: ReactNode
}

type Zone = 'red' | 'amber' | 'green'

function pickZone(ratio: number, polarity: ScorePolarity): Zone {
  const clamped = Math.max(0, Math.min(1, ratio))
  if (polarity === 'higher_is_better') {
    if (clamped >= 0.7) return 'green'
    if (clamped >= 0.4) return 'amber'
    return 'red'
  }
  if (clamped >= 0.7) return 'red'
  if (clamped >= 0.4) return 'amber'
  return 'green'
}

const FILL_CLASS: Record<Zone, string> = {
  red: 'bg-bear-500',
  amber: 'bg-warn-500',
  green: 'bg-bull-500',
}

const VALUE_CLASS: Record<Zone, string> = {
  red: 'text-bear-700',
  amber: 'text-warn-900',
  green: 'text-bull-700',
}

function formatNumber(v: number): string {
  if (Number.isInteger(v)) return v.toString()
  return v.toFixed(1)
}

/**
 * Color score bar matching the in-house scorecard style.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ Label   DESCRIPTION              ↑/↓  value/max            │
 *   │ ━━━━━━━━━━━━━━━━━━━━━━━━━ (filled to ratio, single zone)  │
 *   │ detail line below                                          │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Color rules:
 *   - The fill takes a single zone color (red / amber / green) based on the
 *     value's position within [min, max] AND the polarity.
 *   - For `higher_is_better`, top of the range is green; for
 *     `higher_is_concerning` (Hedging, Evasion, drift), top of the range
 *     is red.
 *   - The numeric value next to the bar is colored to match the zone.
 *
 * The arrow shows up only when a `priorValue` is provided AND the magnitude
 * of the change exceeds `noiseFloor` (defaults to 1.0 on a 10-point scale).
 */
export function ScoreBar({
  label,
  description,
  value,
  min = 0,
  max = 10,
  polarity = 'higher_is_better',
  priorValue,
  noiseFloor,
  valueLabel,
  detail,
}: Props) {
  const safeMin = min
  const safeMax = max
  const span = Math.max(1e-6, safeMax - safeMin)

  const hasValue = typeof value === 'number' && !Number.isNaN(value)
  const ratio = hasValue ? Math.max(0, Math.min(1, ((value as number) - safeMin) / span)) : 0
  const zone: Zone = hasValue ? pickZone(ratio, polarity) : 'amber'
  const fillPct = hasValue ? ratio * 100 : 0

  const renderValue =
    valueLabel ??
    (hasValue ? `${formatNumber(value as number)}/${formatNumber(safeMax)}` : '—')

  const hasPrior = typeof priorValue === 'number' && !Number.isNaN(priorValue)
  const diff = hasValue && hasPrior ? (value as number) - (priorValue as number) : null
  const noise = noiseFloor ?? span / 10
  let arrow: ReactNode = null
  if (diff !== null && Math.abs(diff) >= noise) {
    arrow =
      diff > 0 ? (
        <ArrowUp className={`h-4 w-4 ${VALUE_CLASS[zone]}`} aria-label="up vs prior" />
      ) : (
        <ArrowDown className={`h-4 w-4 ${VALUE_CLASS[zone]}`} aria-label="down vs prior" />
      )
  } else if (diff !== null) {
    arrow = <Minus className="h-4 w-4 text-text-muted" aria-label="within noise floor" />
  }

  return (
    <div className="py-3">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-baseline gap-2">
          <span className="text-base font-semibold text-text-primary">{label}</span>
          {description && (
            <span className="text-[11px] uppercase tracking-[0.14em] text-text-muted">{description}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {arrow}
          <span className={`text-lg font-semibold tabular-nums ${VALUE_CLASS[zone]}`}>{renderValue}</span>
        </div>
      </div>

      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        {hasValue && (
          <span
            className={`absolute left-0 top-0 h-full rounded-full transition-all ${FILL_CLASS[zone]}`}
            style={{ width: `${fillPct}%` }}
            title={
              hasPrior
                ? `${formatNumber(value as number)} (prior ${formatNumber(priorValue as number)})`
                : `${formatNumber(value as number)}/${formatNumber(safeMax)}`
            }
          />
        )}
      </div>

      {detail && <p className="mt-1.5 text-xs text-text-secondary">{detail}</p>}
    </div>
  )
}
