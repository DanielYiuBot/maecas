from pydantic import BaseModel, Field
from typing import Optional, Literal

from backend.schemas.transcript import TranscriptMetadata, Utterance
from backend.schemas.sentiment import SentimentProfile
from backend.schemas.financials import StatedFinancials
from backend.schemas.market import MarketContext, LSEGMarketData
from backend.schemas.guidance import GuidanceCatalysts
from backend.schemas.delta import QoQDelta
from backend.schemas.signals import TradingSignals
from backend.schemas.sentiment import EvidenceCitation, ScoreMethodology
from backend.schemas.expectation import (
    ExpectationReality,
    ValuationLinkage,
    HiddenGem,
)


class NarrativeClaim(BaseModel):
    text: str
    claim_type: Literal["fact", "inference", "speculation"]
    numeric_anchor: Optional[str] = None
    supporting_citations: list[EvidenceCitation]


class NarrativeSection(BaseModel):
    section: str
    summary: str
    claims: list[NarrativeClaim]


class CompositeScore(BaseModel):
    score: int
    key_drivers: list[str]
    methodology: ScoreMethodology
    prior_score: Optional[int] = Field(
        default=None,
        description="Same composite score from the prior analyzed quarter, for QoQ arrows.",
    )


class AnalysisReport(BaseModel):
    job_id: str
    created_at: str
    metadata: TranscriptMetadata
    sentiment: SentimentProfile
    financials: StatedFinancials
    market: MarketContext
    lseg_data: Optional[LSEGMarketData] = None
    guidance: GuidanceCatalysts
    delta: Optional[QoQDelta]
    signals: TradingSignals
    composite_scores: dict[str, CompositeScore]
    narrative: list[NarrativeSection]

    expectation_reality: Optional[ExpectationReality] = None
    valuation_linkage: Optional[ValuationLinkage] = None
    hidden_gems: list[HiddenGem] = Field(default_factory=list)

    pipeline_warnings: list[str] = Field(default_factory=list)
    model_warnings: list[str] = Field(
        default_factory=list,
        description="Things the model is uncertain about (grounding, low-confidence, missing citations).",
    )
    risk_flags: list[str] = Field(
        default_factory=list,
        description="Things that matter to the investment thesis (accounting changes, SBC, thesis caveats).",
    )

    transcript_utterances: list[Utterance] = Field(
        default_factory=list,
        description="Full structured utterances from the parsed transcript, included so the UI can click-to-quote.",
    )
