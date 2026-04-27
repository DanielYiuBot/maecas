from typing import Literal, Optional

from pydantic import BaseModel, Field


class EvidenceCitation(BaseModel):
    speaker: str
    section: str
    utterance_index: int
    quote: str


class ScoreMethodology(BaseModel):
    metric: str
    scale: str
    inputs: list[str]
    heuristic: str


class EvasionScore(BaseModel):
    utterance_index: int
    analyst_question: str
    score: int = Field(ge=0, le=5)
    reason: str
    methodology_note: str

    question_quality: Literal["probing", "soft", "clarifying"] = "clarifying"
    topic: str = ""
    analyst_name: Optional[str] = None


class SentimentBaseline(BaseModel):
    """Anchors a raw sentiment score against prior-quarter and 2-year speaker averages."""

    current: float
    prior_quarter: Optional[float] = None
    speaker_2y_avg: Optional[float] = None
    interpretation: Literal["above_avg", "in_line", "below_avg"] = "in_line"


class SentimentProfile(BaseModel):
    mgmt_confidence_presentation: int = Field(ge=1, le=10)
    mgmt_confidence_qa: int = Field(ge=1, le=10)
    hedging_frequency: int = Field(ge=1, le=10)
    analyst_skepticism: int = Field(ge=1, le=10)
    evasion_scores: list[EvasionScore]
    register: str
    evidence_citations: list[EvidenceCitation]
    confidence: float = Field(ge=0.0, le=1.0)
    low_confidence_flag: bool
    confidence_rationale: str
    score_methodology: list[ScoreMethodology]
    stance_balance: Literal["balanced", "bullish_tilt", "bearish_tilt"]

    mgmt_confidence_presentation_baseline: Optional[SentimentBaseline] = None
    mgmt_confidence_qa_baseline: Optional[SentimentBaseline] = None
