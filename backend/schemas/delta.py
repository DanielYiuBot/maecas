from pydantic import BaseModel, Field
from typing import Optional

from backend.schemas.sentiment import EvidenceCitation, ScoreMethodology


class TopicDelta(BaseModel):
    topic: str
    novelty_status: str
    sentiment_delta: float
    supporting_citations: list[EvidenceCitation]


class SignalNovelty(BaseModel):
    signal_id: str
    novelty_status: str
    rationale: str


class LanguageDrift(BaseModel):
    """Word-level drift between current and prior presentation sections."""

    added_phrases: list[str] = Field(
        default_factory=list,
        description="Distinctive phrases that appear in the current quarter but not prior.",
    )
    removed_phrases: list[str] = Field(
        default_factory=list,
        description="Distinctive phrases that disappeared from the current quarter.",
    )
    hedging_drift: float = Field(
        default=0.0,
        description="Delta in hedge-word frequency (positive = more hedging this quarter).",
    )
    certainty_drift: float = Field(
        default=0.0,
        description="Delta in absolute-language frequency (positive = more certainty this quarter).",
    )


class QoQDelta(BaseModel):
    topic_deltas: list[TopicDelta]
    signal_novelty: list[SignalNovelty]
    new_risk_keywords: list[str]
    guidance_specificity_delta: int = Field(ge=-2, le=2)
    methodology: ScoreMethodology

    language_drift: Optional[LanguageDrift] = None
