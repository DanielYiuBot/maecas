from pydantic import BaseModel
from typing import Optional

from backend.schemas.sentiment import EvidenceCitation, ScoreMethodology


class PricePoint(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float]


class ConsensusEstimates(BaseModel):
    eps_mean: Optional[float]
    revenue_mean: Optional[float]
    ebitda_mean: Optional[float]
    analyst_buy_count: Optional[int]
    analyst_hold_count: Optional[int]
    analyst_sell_count: Optional[int]


class MetricSurpriseSnapshot(BaseModel):
    """FY0-style actual vs mean / surprise (Estimates_Surprise codebook pattern)."""

    actual: Optional[float] = None
    mean_estimate: Optional[float] = None
    surprise_pct: Optional[float] = None
    sue_score: Optional[float] = None
    num_estimates: Optional[int] = None
    act_report_date: Optional[str] = None


class EstimatesSurpriseFY0(BaseModel):
    eps: Optional[MetricSurpriseSnapshot] = None
    revenue: Optional[MetricSurpriseSnapshot] = None


class InstrumentDisplay(BaseModel):
    company_name: Optional[str] = None
    exchange_name: Optional[str] = None


class BeatMissFlag(BaseModel):
    metric: str
    stated_value: Optional[float]
    consensus_value: Optional[float]
    surprise_pct: Optional[float]
    direction: Optional[str]
    transcript_citations: list[EvidenceCitation]
    data_source: str


class ComputedMetric(BaseModel):
    metric: str
    value: Optional[float]
    unit: str
    formula: str
    inputs: dict[str, Optional[float | str]]


class LSEGMarketData(BaseModel):
    resolved_ric: Optional[str]
    price_history: list[PricePoint]
    fundamentals: dict
    consensus: Optional[ConsensusEstimates]
    lseg_available: bool
    estimates_surprise_fy0: Optional[EstimatesSurpriseFY0] = None
    instrument_display: Optional[InstrumentDisplay] = None
    lseg_blocks: Optional[dict[str, bool]] = None


class MarketContext(BaseModel):
    beat_miss_flags: list[BeatMissFlag]
    price_pre_earnings_30d: Optional[float]
    price_post_earnings_10d: Optional[float]
    analyst_rec_summary: Optional[str]
    computed_metrics: list[ComputedMetric]
    balance_risks: list[str]
    lseg_available: bool
    confidence: float
    low_confidence_flag: bool
    confidence_rationale: str
    methodology: ScoreMethodology
