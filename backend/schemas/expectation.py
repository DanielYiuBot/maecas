"""Expectation vs Reality engine — LSEG-anchored snapshot consumed by the
Summary panel.

The 2026 revamp removed the deduced narrative layer (`pre_call_market_narrative`,
`market_expected_sources`, `what_market_is_missing`) because none of those
were citation-anchored. Only the LSEG consensus snapshot and the
citation-bearing `what_changed_items` survive on the dashboard surface.
`ValuationLinkage` was removed. `HiddenGem` was reinstated alongside a new
`PotentialRisk` schema after user feedback that under-discussed threads and
deduced risks are useful even when not directly cited as bull/bear signals.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from backend.schemas.sentiment import EvidenceCitation, ScoreMethodology

SourceTag = Literal["LSEG", "Transcript", "Synthesis"]


class ExpectationBullet(BaseModel):
    text: str
    source: SourceTag = Field(
        default="Synthesis",
        description=(
            "Where the bullet's evidence comes from: LSEG (objective market data), "
            "Transcript (stated by management with a citation), or Synthesis (LLM "
            "combined the two and inferred)."
        ),
    )
    citations: list[EvidenceCitation] = Field(
        default_factory=list,
        description="Transcript evidence that supports this specific bullet.",
    )


class ExpectationReality(BaseModel):
    pre_call_consensus_snapshot: dict[str, Optional[float]] = Field(
        default_factory=dict,
        description="EPS / Revenue / EBITDA FY1 mean estimates captured immediately before the call.",
    )
    what_changed_items: list[ExpectationBullet] = Field(
        default_factory=list,
        description=(
            "Structured 'what changed' bullets, each with a source tag and "
            "(when available) supporting citations. Anchored on the LSEG "
            "consensus snapshot or stated transcript figures, not free narrative."
        ),
    )
    delta_magnitude: Literal["minor", "material", "inflection"] = "material"
    methodology: Optional[ScoreMethodology] = None


class HiddenGem(BaseModel):
    """A statement buried deep or mentioned only once that materially affects the thesis."""

    statement: str
    why_it_matters: str
    mention_count: int = Field(default=1, ge=0)
    citations: list[EvidenceCitation] = Field(default_factory=list)


class PotentialRisk(BaseModel):
    """A risk to the thesis that the LLM judges material but that the market or
    Trading Signals stack may underweight. Sibling to HiddenGem on the surface."""

    risk: str = Field(..., description="One-sentence summary of the risk.")
    why_it_matters: str = Field(
        default="",
        description="One-sentence consequence for the thesis or P&L if the risk materialises.",
    )
    severity: Literal["low", "medium", "high"] = Field(
        default="medium",
        description="Qualitative severity bucket. High = could invert the decision.",
    )
    citations: list[EvidenceCitation] = Field(default_factory=list)
