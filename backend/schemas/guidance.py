from pydantic import BaseModel, Field
from typing import Literal

from backend.schemas.financials import GuidanceRange
from backend.schemas.sentiment import EvidenceCitation, ScoreMethodology


class Catalyst(BaseModel):
    description: str
    timeline: str = "unspecified"
    magnitude_est: str = "unspecified"
    confidence: float
    claim_type: str
    evidence_citations: list[EvidenceCitation]

    invalidation_triggers: list[str] = Field(
        default_factory=list,
        description="Specific events / data points that would falsify this catalyst.",
    )
    expected_impact_magnitude: Literal["low", "medium", "high"] = "medium"
    probability: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Estimated probability the catalyst materialises within its timeline.",
    )


class ImplicitSignal(BaseModel):
    topic: str
    claim_type: str
    evidence_citations: list[EvidenceCitation]


class GuidanceCatalysts(BaseModel):
    explicit_guidance: list[GuidanceRange]
    implicit_signals: list[ImplicitSignal]
    catalysts: list[Catalyst]
    surprise_gap_score: float
    surprise_gap_methodology: ScoreMethodology
