import { Eye, Lightbulb, RefreshCcw } from 'lucide-react'
import type { DeltaMagnitude, ExpectationBullet, ExpectationReality } from '../types/api'
import { CitationButton } from './CitationButton'
import { MethodologyTip } from './MethodologyTip'

interface Props {
  expectation: ExpectationReality | null
}

const DELTA_STYLES: Record<DeltaMagnitude, string> = {
  minor: 'bg-ink-100 text-text-secondary border-border',
  material: 'bg-warn-50 text-warn-900 border-warn-100',
  inflection: 'bg-bull-50 text-bull-900 border-bull-100',
}

function fmtConsensusNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}K`
  return v.toFixed(2)
}

function legacyItems(points: string[]): ExpectationBullet[] {
  return points.map((text) => ({ text, citations: [] }))
}

function sourceLabel(source: string): string {
  const normalized = source.toLowerCase()
  if (normalized.includes('lseg') || normalized.includes('consensus')) {
    return source.toUpperCase().startsWith('LSEG') ? source : `LSEG: ${source}`
  }
  if (normalized.includes('financial')) {
    return `Transcript: ${source}`
  }
  if (normalized.includes('market context') || normalized.includes('beat/miss')) {
    return `LSEG + transcript: ${source}`
  }
  return source
}

function BulletList({
  items,
  empty,
  markerClass,
}: {
  items: ExpectationBullet[]
  empty: string
  markerClass: string
}) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">{empty}</p>
  }

  return (
    <ul className="space-y-3 text-sm text-text-primary">
      {items.map((item, i) => (
        <li key={`${item.text}-${i}`} className="space-y-1.5">
          <div className="flex gap-1.5">
            <span className={markerClass}>·</span>
            <span>{item.text}</span>
          </div>
          {item.citations.length > 0 && (
            <div className="ml-4 flex flex-wrap gap-1.5">
              {item.citations.slice(0, 3).map((c, citationIndex) => (
                <CitationButton key={citationIndex} citation={c} compact />
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function ExpectationRealityPanel({ expectation }: Props) {
  if (!expectation) return null

  const snap = expectation.pre_call_consensus_snapshot || {}
  const sources =
    expectation.market_expected_sources && expectation.market_expected_sources.length > 0
      ? expectation.market_expected_sources
      : ['LSEG FY1 consensus', 'stated financials', 'market context']
  const whatChangedItems =
    expectation.what_changed_items && expectation.what_changed_items.length > 0
      ? expectation.what_changed_items
      : legacyItems(expectation.what_changed)
  const whatMissingItems =
    expectation.what_market_is_missing_items && expectation.what_market_is_missing_items.length > 0
      ? expectation.what_market_is_missing_items
      : legacyItems(expectation.what_market_is_missing)
  const hasPairedCitations = [...whatChangedItems, ...whatMissingItems].some((item) => item.citations.length > 0)

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Market Alignment</p>
          <h3 className="maecas-title">Expectation vs Reality</h3>
          <p className="maecas-subtitle mt-0.5">
            Pre-call narrative anchored in consensus and market context, compared to post-call outcome.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${DELTA_STYLES[expectation.delta_magnitude]}`}
        >
          {expectation.delta_magnitude}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-muted/60 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            <Eye className="h-3.5 w-3.5" /> Market expected
          </p>
          <p className="text-sm text-text-primary">{expectation.pre_call_market_narrative}</p>
          <div className="mt-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Grounded in
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sources.map((source) => (
                <span
                  key={source}
                  className="rounded-full border border-border bg-surface-card px-2 py-0.5 text-[11px] text-text-secondary"
                >
                  {sourceLabel(source)}
                </span>
              ))}
            </div>
          </div>
          {(snap.eps_fy1_mean != null || snap.revenue_fy1_mean != null || snap.ebitda_fy1_mean != null) && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-text-muted">FY1 EPS</p>
                <p className="font-mono font-medium text-text-primary">{fmtConsensusNum(snap.eps_fy1_mean)}</p>
              </div>
              <div>
                <p className="text-text-muted">FY1 Revenue</p>
                <p className="font-mono font-medium text-text-primary">{fmtConsensusNum(snap.revenue_fy1_mean)}</p>
              </div>
              <div>
                <p className="text-text-muted">FY1 EBITDA</p>
                <p className="font-mono font-medium text-text-primary">{fmtConsensusNum(snap.ebitda_fy1_mean)}</p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-accent-100 bg-accent-50/60 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent-700">
            <RefreshCcw className="h-3.5 w-3.5" /> What changed
          </p>
          <BulletList
            items={whatChangedItems}
            empty="No material deltas identified."
            markerClass="text-accent-700"
          />
        </div>

        <div className="rounded-lg border border-bull-100 bg-bull-50/50 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-bull-900">
            <Lightbulb className="h-3.5 w-3.5" /> What market is missing
          </p>
          <BulletList
            items={whatMissingItems}
            empty="Nothing flagged as mispriced."
            markerClass="text-bull-700"
          />
        </div>
      </div>

      {!hasPairedCitations && expectation.citations.length > 0 && (
        <div className="mt-4 space-y-1">
          <p className="maecas-eyebrow">Evidence</p>
          <p className="text-xs text-text-muted">
            Legacy report format: citations were not paired to individual bullets.
          </p>
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {expectation.citations.slice(0, 6).map((c, i) => (
              <CitationButton key={i} citation={c} compact />
            ))}
          </div>
        </div>
      )}

      {expectation.methodology && (
        <div className="mt-3">
          <MethodologyTip>{expectation.methodology.heuristic}</MethodologyTip>
        </div>
      )}
    </div>
  )
}
