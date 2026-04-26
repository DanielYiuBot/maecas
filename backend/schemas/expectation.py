"""Expectation vs Reality engine — pre-call narrative vs post-call outcome."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from backend.schemas.sentiment import EvidenceCitation, ScoreMethodology


class ExpectationReality(BaseModel):
    pre_call_market_narrative: str = Field(
        ...,
        description="1-3 sentence summary of what the market expected heading into the call, synthesised from pre-call news and consensus.",
    )
    pre_call_consensus_snapshot: dict[str, Optional[float]] = Field(
        default_factory=dict,
        description="EPS / Revenue / EBITDA FY1 mean estimates captured immediately before the call.",
    )
    what_changed: list[str] = Field(
        default_factory=list,
        description="Specific deltas between pre-call narrative and post-call facts.",
    )
    what_market_is_missing: list[str] = Field(
        default_factory=list,
        description="Material points the model believes the market has not yet fully priced.",
    )
    delta_magnitude: Literal["minor", "material", "inflection"] = "material"
    citations: list[EvidenceCitation] = Field(default_factory=list)
    methodology: Optional[ScoreMethodology] = None


class ValuationSensitivityRow(BaseModel):
    scenario: Literal["bull", "base", "bear"]
    rev_delta_pct: Optional[float] = None
    eps_delta_pct: Optional[float] = None
    commentary: str = ""


class ValuationLinkage(BaseModel):
    """DEPRECATED: kept for backward compatibility with stored jobs only.
    The dashboard no longer renders this; the orchestrator emits None.
    Translating transcript guidance into implied % upside vs consensus
    proved too sensitive to unit-scaling heuristics to ship reliably."""

    fy1_consensus_eps: Optional[float] = None
    fy1_consensus_revenue: Optional[float] = None
    fy1_consensus_ebitda: Optional[float] = None
    implied_revenue_upside_pct: Optional[float] = Field(
        default=None,
        description="Percent upside the transcript guidance implies vs FY1 revenue consensus.",
    )
    implied_eps_upside_pct: Optional[float] = None
    multiple_justification: str = ""
    sensitivity: list[ValuationSensitivityRow] = Field(default_factory=list)
    methodology: Optional[ScoreMethodology] = None


class HiddenGem(BaseModel):
    """A statement buried deep or mentioned only once that materially affects the thesis."""

    statement: str
    why_it_matters: str
    mention_count: int = Field(default=1, ge=0)
    citations: list[EvidenceCitation] = Field(default_factory=list)


ThesisOutcome = Literal["confirmed", "falsified", "open", "unknown"]
TrackRecordStatus = Literal["available", "insufficient_history", "unavailable"]


class PriorThesisEntry(BaseModel):
    event_date: str
    job_id: Optional[str] = None
    one_liner: str
    decision: Literal["Buy", "Monitor", "Avoid"]
    conviction: Literal["High", "Medium", "Low"]
    primary_signal_ids: list[str] = Field(default_factory=list)
    post_earnings_return_pct: Optional[float] = Field(
        default=None,
        description="Post-call price return over the stored window, when available.",
    )
    post_earnings_window: Optional[str] = Field(
        default=None,
        description="Return window label, e.g. 10d.",
    )
    thesis_outcome: ThesisOutcome = Field(
        default="unknown",
        description="Deterministic outcome tag from available post-call return/falsifier evidence.",
    )
    outcome_rationale: str = ""


class TrackRecordSummary(BaseModel):
    prior_call_count: int = 0
    confirmed_count: int = 0
    falsified_count: int = 0
    open_count: int = 0
    unknown_count: int = 0
    comparable_decision_count: int = 0
    avg_post_earnings_return_pct: Optional[float] = None
    return_window: Optional[str] = None
    status: TrackRecordStatus = "unavailable"
    rationale: str = ""


class ThesisMemory(BaseModel):
    """Cross-quarter memory: prior theses for the same ticker."""

    prior_theses: list[PriorThesisEntry] = Field(default_factory=list)
    thesis_evolution: Literal["new", "evolved", "reversed", "reinforced"] = "new"
    evolution_rationale: str = ""
    track_record: TrackRecordSummary = Field(default_factory=TrackRecordSummary)
