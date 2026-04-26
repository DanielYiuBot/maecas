import { AlertTriangle, Info, Lightbulb, ShieldAlert } from 'lucide-react'
import type { HiddenGem, NarrativeClaim, NarrativeSection } from '../types/api'
import { CitationButton } from './CitationButton'
import { MethodologyTip } from './MethodologyTip'
import {
  SEVERITY_STYLE,
  groupBySeverity,
  type ClassifiedRisk,
  type RiskSeverity,
} from '../lib/riskSeverity'

interface Props {
  narrative: NarrativeSection[]
  hiddenGems: HiddenGem[]
  modelWarnings: string[]
  riskFlags: string[]
}

function sectionTitle(section: string): string {
  if (section === 'what_changed') return 'What changed vs expectations'
  if (section === 'management_downplayed') return "What management didn't emphasize"
  return section.replace(/_/g, ' ')
}

function ClaimBlock({ claim }: { claim: NarrativeClaim }) {
  return (
    <div className="rounded border border-border bg-surface-card p-2">
      <p className="text-xs text-text-primary">{claim.text}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-text-secondary">{claim.claim_type}</span>
        {claim.numeric_anchor && (
          <span className="rounded bg-bull-50 px-1.5 py-0.5 font-mono text-bull-700">{claim.numeric_anchor}</span>
        )}
      </div>
      {claim.supporting_citations.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {claim.supporting_citations.map((c, i) => (
            <CitationButton key={i} citation={c} compact />
          ))}
        </div>
      )}
    </div>
  )
}

function SectionBlock({ section }: { section: NarrativeSection }) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted/60 p-4">
      <h4 className="mb-1.5 text-sm font-semibold text-text-primary">
        {sectionTitle(section.section)}
      </h4>
      <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">
        {section.summary}
      </p>
      {section.claims.length > 0 && (
        <div className="mt-3 space-y-2">
          {section.claims.map((claim, idx) => (
            <ClaimBlock key={idx} claim={claim} />
          ))}
        </div>
      )}
    </div>
  )
}

function HiddenGemBlock({ gem }: { gem: HiddenGem }) {
  const label = gem.mention_count <= 1 ? 'Single-mention thread' : `Under-discussed · ${gem.mention_count} mentions`
  return (
    <div className="rounded-lg border border-warn-100 bg-warn-50/60 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Lightbulb className="h-3.5 w-3.5 text-warn-900" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-warn-900">
          {label}
        </span>
      </div>
      <p className="text-sm font-medium text-text-primary">{gem.statement}</p>
      <p className="mt-1 text-xs text-text-secondary">
        <span className="font-semibold">Why it matters:</span> {gem.why_it_matters}
      </p>
      {gem.citations.length > 0 && (
        <div className="mt-2 space-y-1">
          {gem.citations.map((c, i) => (
            <CitationButton key={i} citation={c} compact />
          ))}
        </div>
      )}
    </div>
  )
}

export function WhatChangedPanel({
  narrative,
  hiddenGems,
  modelWarnings,
  riskFlags,
}: Props) {
  const filteredSections = narrative.filter(
    (s) => s.section === 'what_changed' || s.section === 'management_downplayed'
  )

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Delta Notes</p>
          <h3 className="maecas-title">What changed &amp; what was downplayed</h3>
          <p className="maecas-subtitle mt-0.5">
            Non-redundant commentary — the Trading Signals panel already owns the bull/bear arguments.
          </p>
        </div>
      </div>

      {filteredSections.length === 0 ? (
        <p className="text-sm text-text-muted">Orchestrator produced no narrative sections for this run.</p>
      ) : (
        <div className="space-y-3">
          {filteredSections.map((s) => (
            <SectionBlock key={s.section} section={s} />
          ))}
        </div>
      )}

      {hiddenGems.length > 0 && (
        <div className="mt-5">
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <Lightbulb className="h-4 w-4 text-warn-900" />
            Under-discussed threads
            <MethodologyTip label="Method" width="lg">
              Includes low-frequency statements that were not already promoted as core thesis, primary signals, or top catalysts.
            </MethodologyTip>
          </h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {hiddenGems.map((gem, i) => (
              <HiddenGemBlock key={i} gem={gem} />
            ))}
          </div>
        </div>
      )}

      {(modelWarnings.length > 0 || riskFlags.length > 0) && (
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {modelWarnings.length > 0 && (
            <div className="rounded-lg border border-info-100 bg-info-100/40 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-info-900">
                <Info className="h-3.5 w-3.5" /> Model warnings
                <span className="ml-auto font-mono text-info-900">{modelWarnings.length}</span>
              </p>
              <ul className="space-y-0.5 text-xs text-info-900">
                {modelWarnings.map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
            </div>
          )}
          {riskFlags.length > 0 && <RiskFlagsBlock flags={riskFlags} />}
        </div>
      )}
    </div>
  )
}

function RiskFlagsBlock({ flags }: { flags: string[] }) {
  // Severity buckets give risk flags the asymmetric weight they deserve;
  // a flat list makes "Anthropic supply chain risk" look identical to
  // "SBC accounting change" even though they are not the same magnitude.
  const grouped = groupBySeverity(flags)
  const order: RiskSeverity[] = ['high', 'medium', 'low']
  return (
    <div className="rounded-lg border border-bear-100 bg-bear-50/30 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-bear-900">
        <ShieldAlert className="h-3.5 w-3.5" /> Risk flags
        <span className="ml-auto font-mono text-bear-900">{flags.length}</span>
      </p>
      <div className="mb-2">
        <MethodologyTip width="lg">
          Risk flags come from pipeline warnings classified as thesis-relevant, then grouped by a deterministic keyword severity dictionary.
        </MethodologyTip>
      </div>
      <div className="space-y-2">
        {order.map((sev) => {
          const items: ClassifiedRisk[] = grouped[sev]
          if (items.length === 0) return null
          const style = SEVERITY_STYLE[sev]
          return (
            <div key={sev}>
              <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                <span className={`rounded border px-1.5 py-0.5 ${style.chip}`}>{style.label}</span>
                <span>severity</span>
              </p>
              <ul className="space-y-0.5 text-xs text-text-primary">
                {items.map((r, i) => (
                  <li key={i} className="flex gap-1">
                    <AlertTriangle className={`mt-0.5 h-3 w-3 shrink-0 ${sev === 'high' ? 'text-bear-700' : sev === 'medium' ? 'text-warn-900' : 'text-text-muted'}`} />
                    <span>{r.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] italic text-text-muted">
        Severity inferred from keyword match — see lib/riskSeverity.ts for the dictionary.
      </p>
    </div>
  )
}
