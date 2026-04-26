export type ConfidenceLabel = 'High' | 'Medium' | 'Low'

export interface BucketedConfidence {
  label: ConfidenceLabel
  className: string
}

/**
 * Map a 0..1 confidence float into a coarse High/Medium/Low bucket.
 * The dashboard intentionally hides decimals — fluffy LLM-generated
 * confidence numbers create false precision (a "95% confidence" on a
 * qualitative text-derived signal is not meaningfully different from
 * "85%"). The original float remains on the schema for any consumer
 * that wants it; we just don't render it.
 *
 * Thresholds were tightened (Low <0.55, Medium 0.55-0.9, High >=0.9)
 * after a trader review pointed out the previous cuts produced "High"
 * on virtually every signal — when everything is High, nothing is.
 */
export function bucketConfidence(value: number | null | undefined): BucketedConfidence {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { label: 'Low', className: 'bg-ink-100 text-text-secondary border-ink-200' }
  }
  if (value >= 0.9) {
    return { label: 'High', className: 'bg-bull-50 text-bull-900 border-bull-100' }
  }
  if (value >= 0.55) {
    return { label: 'Medium', className: 'bg-warn-50 text-warn-900 border-warn-100' }
  }
  return { label: 'Low', className: 'bg-bear-50 text-bear-900 border-bear-100' }
}

export function shouldSurfaceConfidence(value: number | null | undefined): boolean {
  return bucketConfidence(value).label !== 'High'
}

interface ConfidenceBadgeProps {
  value: number | null | undefined
  prefix?: string
  size?: 'sm' | 'xs'
}

export function ConfidenceBadge({ value, prefix = 'Confidence', size = 'xs' }: ConfidenceBadgeProps) {
  const b = bucketConfidence(value)
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[10px]'
  const title =
    typeof value === 'number'
      ? 'Qualitative confidence bucket; underlying model value hidden to avoid false precision'
      : 'Confidence unknown'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border font-medium ${sizeClass} ${b.className}`}
      title={title}
    >
      {prefix && <span className="uppercase tracking-wide opacity-70">{prefix}</span>}
      <span>{b.label}</span>
    </span>
  )
}
