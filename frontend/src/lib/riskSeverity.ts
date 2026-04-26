export type RiskSeverity = 'high' | 'medium' | 'low'

export interface ClassifiedRisk {
  text: string
  severity: RiskSeverity
}

const HIGH_KEYWORDS = [
  'accounting',
  'restatement',
  'material weakness',
  'china',
  'export control',
  'regulatory',
  'investigation',
  'subpoena',
  'litigation',
  'fraud',
  'going concern',
  'customer concentration',
  'covenant',
  'liquidity',
]

const MEDIUM_KEYWORDS = [
  'sbc',
  'stock-based',
  'stock based',
  'capex',
  'capital expenditure',
  'dilution',
  'supply',
  'inventory',
  'tariff',
  'fx',
  'foreign exchange',
  'pricing pressure',
  'guidance miss',
]

/**
 * Classify a free-text risk flag into High / Medium / Low severity using a
 * keyword heuristic. Frontend-only — keeps the existing string-array schema
 * intact. The trader's critique called the ungrouped flat list "a checklist"
 * because identical visual weight implied identical magnitude; bucketing by
 * severity restores the asymmetry that real risk assessment requires.
 */
export function classifyRisk(text: string): ClassifiedRisk {
  const low = text.toLowerCase()
  for (const k of HIGH_KEYWORDS) {
    if (low.includes(k)) return { text, severity: 'high' }
  }
  for (const k of MEDIUM_KEYWORDS) {
    if (low.includes(k)) return { text, severity: 'medium' }
  }
  return { text, severity: 'low' }
}

const SEVERITY_ORDER: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 }

export function groupBySeverity(flags: string[]): {
  high: ClassifiedRisk[]
  medium: ClassifiedRisk[]
  low: ClassifiedRisk[]
} {
  const out = { high: [] as ClassifiedRisk[], medium: [] as ClassifiedRisk[], low: [] as ClassifiedRisk[] }
  for (const f of flags) {
    const c = classifyRisk(f)
    out[c.severity].push(c)
  }
  return out
}

export function severityOrder(s: RiskSeverity): number {
  return SEVERITY_ORDER[s]
}

export const SEVERITY_STYLE: Record<RiskSeverity, { chip: string; label: string }> = {
  high: { chip: 'border-bear-100 bg-bear-50 text-bear-900', label: 'High' },
  medium: { chip: 'border-warn-100 bg-warn-50 text-warn-900', label: 'Medium' },
  low: { chip: 'border-ink-200 bg-ink-100 text-text-secondary', label: 'Low' },
}
