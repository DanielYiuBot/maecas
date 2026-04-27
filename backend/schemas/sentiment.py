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


class QAExchange(BaseModel):
    question_utterance_index: int
    answer_utterance_indexes: list[int]
    analyst_question: str
    management_answer: str
    topic: str = ""
    analyst_name: Optional[str] = None
    follow_up: bool = False
    citations: list[EvidenceCitation] = Field(default_factory=list)


class AnalystTopicStat(BaseModel):
    topic: str
    question_count: int = 0
    avg_skepticism: float = 0.0
    avg_evasion: float = 0.0
    answer_quality: Literal["strong", "mixed", "weak"] = "mixed"


class ManagementAnswerQuality(BaseModel):
    directness: int = Field(ge=1, le=10)
    specificity: int = Field(ge=1, le=10)
    numeric_support: int = Field(ge=1, le=10)
    evasion: int = Field(ge=1, le=10)
    topic: str = ""


class SpeakerTone(BaseModel):
    speaker_name: str
    speaker_role: Literal["CEO", "CFO", "Other"]
    confidence: int = Field(ge=1, le=10)
    hedging: int = Field(ge=1, le=10)
    register: str = ""


class SentimentStability(BaseModel):
    coverage_ratio: float = Field(ge=0.0, le=1.0)
    citation_coverage_ratio: float = Field(ge=0.0, le=1.0)
    model_agreement_ratio: float = Field(ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list)


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
    qa_exchanges: list[QAExchange] = Field(default_factory=list)
    analyst_topic_map: list[AnalystTopicStat] = Field(default_factory=list)
    management_answer_quality: list[ManagementAnswerQuality] = Field(default_factory=list)
    speaker_tone: list[SpeakerTone] = Field(default_factory=list)
    sentiment_stability: Optional[SentimentStability] = None
