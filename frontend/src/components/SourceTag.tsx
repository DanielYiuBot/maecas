import type { SourceTag as SourceTagValue } from '../types/api'
import { sourceMeta, type LsegKind } from '../lib/source'
import { ExplainableBadge } from './ExplainableBadge'

interface Props {
  source: SourceTagValue | null | undefined
  /** When `source === 'LSEG'`, narrows the tooltip to the exact data block
   * (consensus / surprise / fundamentals / price_window / instrument). */
  lsegKind?: LsegKind
  size?: 'xs' | 'sm'
}

/** Three-color chip rendered next to every renderable bullet, figure, or
 * signal so the user can tell at a glance whether the line is anchored on
 * objective LSEG data, stated by management with a citation, or LLM-deduced.
 *
 * - LSEG       -> tooltip narrows to the specific lseg block.
 * - Transcript -> renders without a tooltip; the chip's meaning is obvious.
 * - Synthesis  -> tooltip warns the bullet is LLM-deduced. */
export function SourceTag({ source, lsegKind, size = 'xs' }: Props) {
  const meta = sourceMeta(source, lsegKind)
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[10px]'

  if (meta.explanation == null) {
    return (
      <span className={`inline-flex items-center rounded border font-medium uppercase tracking-wide ${sizeClass} ${meta.className}`}>
        {meta.label}
      </span>
    )
  }

  return (
    <ExplainableBadge
      className={`uppercase tracking-wide ${sizeClass} ${meta.className}`}
      explanation={meta.explanation}
    >
      {meta.label}
    </ExplainableBadge>
  )
}
