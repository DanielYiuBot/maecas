export interface Utterance {
  index: number
  speaker_name: string
  speaker_role: 'CEO' | 'CFO' | 'Analyst' | 'Operator' | 'Unknown'
  section: 'Presentation' | 'QA'
  text: string
}

export interface TranscriptMetadata {
  event_id: string
  company_name: string
  company_ticker: string
  ric: string | null
  cusip: string | null
  isin: string | null
  event_type_id: string
  event_date: string
  last_update: string
  expiration_date: string
  same_year_check: boolean
  resolved_ric: string | null
}

export interface EvidenceCitation {
  speaker: string
  section: string
  utterance_index: number
  quote: string
}

export interface ScoreMethodology {
  metric: string
  scale: string
  inputs: string[]
  heuristic: string
}

export type QuestionQuality = 'probing' | 'soft' | 'clarifying'

export interface EvasionScore {
  utterance_index: number
  analyst_question: string
  score: number
  reason: string
  methodology_note: string
  question_quality: QuestionQuality
  topic: string
  analyst_name: string | null
}

export type BaselineInterpretation = 'above_avg' | 'in_line' | 'below_avg'

export interface SentimentBaseline {
  current: number
  prior_quarter: number | null
  speaker_2y_avg: number | null
  interpretation: BaselineInterpretation
}

export interface SentimentProfile {
  mgmt_confidence_presentation: number
  mgmt_confidence_qa: number
  hedging_frequency: number
  analyst_skepticism: number
  evasion_scores: EvasionScore[]
  register: string
  evidence_citations: EvidenceCitation[]
  confidence: number
  low_confidence_flag: boolean
  confidence_rationale: string
  score_methodology: ScoreMethodology[]
  stance_balance: 'balanced' | 'bullish_tilt' | 'bearish_tilt'
  mgmt_confidence_presentation_baseline: SentimentBaseline | null
  mgmt_confidence_qa_baseline: SentimentBaseline | null
}

export interface StatedFigure {
  label: string
  value: number | null
  unit: string
  period: string | null
  source: 'Presentation' | 'QA' | 'Both'
  yoy_change: number | null
  quote: string
}

export interface GuidanceRange {
  metric: string
  low: number | null
  high: number | null
  qualifier: 'confirmed' | 'conditional' | 'aspirational'
  timeline: string
  quote: string
}

export interface StatedFinancials {
  figures: StatedFigure[]
  qa_only_figures: StatedFigure[]
  declined_to_quantify: string[]
  guidance_ranges: GuidanceRange[]
  confidence: number
  low_confidence_flag: boolean
}

export interface PricePoint {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export interface ConsensusEstimates {
  eps_mean: number | null
  revenue_mean: number | null
  ebitda_mean: number | null
  analyst_buy_count: number | null
  analyst_hold_count: number | null
  analyst_sell_count: number | null
}

export interface MetricSurpriseSnapshot {
  actual: number | null
  mean_estimate: number | null
  surprise_pct: number | null
  sue_score: number | null
  num_estimates: number | null
  act_report_date: string | null
}

export interface EstimatesSurpriseFY0 {
  eps: MetricSurpriseSnapshot | null
  revenue: MetricSurpriseSnapshot | null
}

export interface InstrumentDisplay {
  company_name: string | null
  exchange_name: string | null
}

export interface BeatMissFlag {
  metric: string
  stated_value: number | null
  consensus_value: number | null
  surprise_pct: number | null
  direction: string | null
  transcript_citations: EvidenceCitation[]
  data_source: string
}

export interface ComputedMetric {
  metric: string
  value: number | null
  unit: string
  formula: string
  inputs: Record<string, number | null>
}

export interface LSEGMarketData {
  resolved_ric: string | null
  price_history: PricePoint[]
  fundamentals: Record<string, unknown>
  consensus: ConsensusEstimates | null
  lseg_available: boolean
  estimates_surprise_fy0?: EstimatesSurpriseFY0 | null
  instrument_display?: InstrumentDisplay | null
  lseg_blocks?: Record<string, boolean> | null
}

export interface MarketContext {
  beat_miss_flags: BeatMissFlag[]
  price_pre_earnings_30d: number | null
  price_post_earnings_10d: number | null
  analyst_rec_summary: string | null
  computed_metrics: ComputedMetric[]
  balance_risks: string[]
  lseg_available: boolean
  confidence: number
  low_confidence_flag: boolean
  confidence_rationale: string
  methodology: ScoreMethodology
}

export type ImpactMagnitude = 'low' | 'medium' | 'high'

export interface Catalyst {
  description: string
  timeline: string
  magnitude_est: string
  confidence: number
  claim_type: string
  evidence_citations: EvidenceCitation[]
  invalidation_triggers: string[]
  expected_impact_magnitude: ImpactMagnitude
  probability: number
}

export interface ImplicitSignal {
  topic: string
  claim_type: string
  evidence_citations: EvidenceCitation[]
}

export interface GuidanceCatalysts {
  explicit_guidance: GuidanceRange[]
  implicit_signals: ImplicitSignal[]
  catalysts: Catalyst[]
  surprise_gap_score: number
  surprise_gap_methodology: ScoreMethodology
}

export interface TopicDelta {
  topic: string
  novelty_status: string
  sentiment_delta: number
  supporting_citations: EvidenceCitation[]
}

export interface SignalNovelty {
  signal_id: string
  novelty_status: string
  rationale: string
}

export interface LanguageDrift {
  added_phrases: string[]
  removed_phrases: string[]
  hedging_drift: number
  certainty_drift: number
}

export interface QoQDelta {
  topic_deltas: TopicDelta[]
  signal_novelty: SignalNovelty[]
  new_risk_keywords: string[]
  guidance_specificity_delta: number
  methodology: ScoreMethodology
  language_drift: LanguageDrift | null
}

export type TimeHorizon = '0-3m' | '3-6m' | '6-12m' | '12m+'
export type PricedInAssessment = 'priced_in' | 'partially_priced' | 'not_priced' | 'unknown'
export type PnlLinkage = 'revenue' | 'margin' | 'multiple' | 'capex' | 'mix'
export type PriorityTier = 'primary' | 'secondary' | 'noise'

export interface Signal {
  signal_id: string
  description: string
  claim_type: 'fact' | 'inference' | 'speculation'
  novelty_status: 'new' | 'repeated' | 'de_emphasized' | 'resolved'
  matched_prior_signal_id: string | null
  evidence_citations: EvidenceCitation[]
  confidence: number
  confidence_rationale: string
  numeric_anchor: string | null
  risk_tags: string[]
  priority_tier: PriorityTier
  so_what: string
  time_horizon: TimeHorizon
  pnl_linkage: PnlLinkage
  priced_in_assessment: PricedInAssessment
  consensus_aware?: boolean
}

export interface CoreThesis {
  one_liner: string
  bull_case: string
  bear_case: string
  decision: 'Buy' | 'Monitor' | 'Avoid'
  conviction: 'High' | 'Medium' | 'Low'
  time_horizon: TimeHorizon
  key_driver_signal_id: string
  key_risk_signal_id: string
  what_would_change_this: string[]
}

export interface TradingSignals {
  core_thesis: CoreThesis | null
  bull_signals: Signal[]
  bear_signals: Signal[]
  direction: 'Bullish' | 'Neutral' | 'Bearish'
  action: 'Buy' | 'Monitor' | 'Avoid'
  reasoning_chain: string[]
  top_catalysts: string[]
  balance_assessment: string
  signal_methodology: ScoreMethodology
}

export interface NarrativeClaim {
  text: string
  claim_type: 'fact' | 'inference' | 'speculation'
  numeric_anchor: string | null
  supporting_citations: EvidenceCitation[]
}

export interface NarrativeSection {
  section: string
  summary: string
  claims: NarrativeClaim[]
}

export interface CompositeScore {
  score: number
  key_drivers: string[]
  methodology: ScoreMethodology
  prior_score: number | null
}

export type DeltaMagnitude = 'minor' | 'material' | 'inflection'

export interface ExpectationBullet {
  text: string
  citations: EvidenceCitation[]
}

export interface ExpectationReality {
  pre_call_market_narrative: string
  market_expected_sources?: string[]
  pre_call_consensus_snapshot: Record<string, number | null>
  what_changed: string[]
  what_market_is_missing: string[]
  what_changed_items?: ExpectationBullet[]
  what_market_is_missing_items?: ExpectationBullet[]
  delta_magnitude: DeltaMagnitude
  citations: EvidenceCitation[]
  methodology: ScoreMethodology | null
}

export interface ValuationSensitivityRow {
  scenario: 'bull' | 'base' | 'bear'
  rev_delta_pct: number | null
  eps_delta_pct: number | null
  commentary: string
}

export interface ValuationLinkage {
  fy1_consensus_eps: number | null
  fy1_consensus_revenue: number | null
  fy1_consensus_ebitda: number | null
  implied_revenue_upside_pct: number | null
  implied_eps_upside_pct: number | null
  multiple_justification: string
  sensitivity: ValuationSensitivityRow[]
  methodology: ScoreMethodology | null
}

export interface HiddenGem {
  statement: string
  why_it_matters: string
  mention_count: number
  citations: EvidenceCitation[]
}

export interface AnalysisReport {
  job_id: string
  created_at: string
  metadata: TranscriptMetadata
  sentiment: SentimentProfile
  financials: StatedFinancials
  market: MarketContext
  lseg_data: LSEGMarketData | null
  guidance: GuidanceCatalysts
  delta: QoQDelta | null
  signals: TradingSignals
  composite_scores: Record<string, CompositeScore>
  narrative: NarrativeSection[]
  expectation_reality: ExpectationReality | null
  valuation_linkage: ValuationLinkage | null
  hidden_gems: HiddenGem[]
  pipeline_warnings: string[]
  model_warnings: string[]
  risk_flags: string[]
  transcript_utterances: Utterance[]
}

export interface SSEEvent {
  stage: string
  agent: string | null
  status: 'queued' | 'running' | 'complete' | 'skipped' | 'error'
  progress_pct: number
  message: string
}

export interface JobSummary {
  job_id: string
  ticker: string | null
  company_name: string | null
  event_date: string | null
  action: string | null
  status: string
  created_at: string | null
}
