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


class ComparisonWindow(BaseModel):
    current_event_date: str
    prior_event_dates: list[str] = Field(default_factory=list)


class PairwiseDelta(BaseModel):
    prior_event_date: str
    topic_deltas: list[TopicDelta] = Field(default_factory=list)
    signal_novelty: list[SignalNovelty] = Field(default_factory=list)
    new_risk_keywords: list[str] = Field(default_factory=list)
    guidance_specificity_delta: int = Field(default=0, ge=-2, le=2)
    language_drift: Optional[LanguageDrift] = None
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)


class TrendDelta(BaseModel):
    topic: str
    trend: str
    rationale: str
    supporting_citations: list[EvidenceCitation] = Field(default_factory=list)


class TopicTrajectoryPoint(BaseModel):
    event_date: str
    novelty_status: str
    sentiment_delta: float


class TopicTrajectory(BaseModel):
    topic: str
    points: list[TopicTrajectoryPoint] = Field(default_factory=list)


class StabilityChecks(BaseModel):
    citation_coverage_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    disagreement_flags: list[str] = Field(default_factory=list)
    low_confidence_reasons: list[str] = Field(default_factory=list)


class QoQDelta(BaseModel):
    topic_deltas: list[TopicDelta] = Field(default_factory=list)
    signal_novelty: list[SignalNovelty] = Field(default_factory=list)
    new_risk_keywords: list[str] = Field(default_factory=list)
    guidance_specificity_delta: int = Field(default=0, ge=-2, le=2)
    methodology: ScoreMethodology

    language_drift: Optional[LanguageDrift] = None
    comparison_window: Optional[ComparisonWindow] = None
    pairwise_comparisons: list[PairwiseDelta] = Field(default_factory=list)
    trend_deltas: list[TrendDelta] = Field(default_factory=list)
    topic_trajectory: list[TopicTrajectory] = Field(default_factory=list)
    stability_checks: Optional[StabilityChecks] = None
