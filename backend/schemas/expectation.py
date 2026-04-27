"""Expectation vs Reality engine — pre-call narrative vs post-call outcome."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from backend.schemas.sentiment import EvidenceCitation, ScoreMethodology


class ExpectationBullet(BaseModel):
    text: str
    citations: list[EvidenceCitation] = Field(
        default_factory=list,
        description="Transcript evidence that supports this specific bullet.",
    )


class ExpectationReality(BaseModel):
    pre_call_market_narrative: str = Field(
        ...,
        description="1-3 sentence summary of what the market expected heading into the call, synthesized from consensus and available market context.",
    )
    market_expected_sources: list[str] = Field(
        default_factory=list,
        description="Human-readable source labels used to ground the pre-call market narrative.",
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
    what_changed_items: list[ExpectationBullet] = Field(
        default_factory=list,
        description="Structured what_changed bullets with citations paired to each bullet.",
    )
    what_market_is_missing_items: list[ExpectationBullet] = Field(
        default_factory=list,
        description="Structured what_market_is_missing bullets with citations paired to each bullet.",
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
