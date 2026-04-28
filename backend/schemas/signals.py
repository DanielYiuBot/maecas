from pydantic import BaseModel, Field
from typing import Literal, Optional

from backend.schemas.sentiment import EvidenceCitation, ScoreMethodology


HorizonLiteral = Literal["0-3m", "3-6m", "6-12m", "12m+"]
PricedInLiteral = Literal["priced_in", "partially_priced", "not_priced", "unknown"]
PnlLinkageLiteral = Literal["revenue", "margin", "multiple", "capex", "mix"]
PriorityTierLiteral = Literal["primary", "secondary", "noise"]
SourceTag = Literal["LSEG", "Transcript", "Synthesis"]


class Signal(BaseModel):
    signal_id: str
    description: str
    claim_type: Literal["fact", "inference", "speculation"]
    novelty_status: Literal["new", "repeated", "de_emphasized", "resolved"]
    matched_prior_signal_id: Optional[str] = None
    evidence_citations: list[EvidenceCitation]
    confidence: float
    confidence_rationale: str
    numeric_anchor: Optional[str] = None
    risk_tags: list[str]

    priority_tier: PriorityTierLiteral = "secondary"
    so_what: str = ""
    time_horizon: HorizonLiteral = "3-6m"
    pnl_linkage: PnlLinkageLiteral = "revenue"
    priced_in_assessment: PricedInLiteral = "unknown"

    source: SourceTag = Field(
        default="Synthesis",
        description=(
            "Where the signal's evidence comes from. LSEG = grounded in "
            "objective market data; Transcript = stated by management with a "
            "citation; Synthesis = LLM inference combining the two. The UI "
            "renders this as a small color tag next to the signal."
        ),
    )

    @property
    def consensus_aware(self) -> bool:
        """Back-compat shim: `true` when the market has digested this signal."""
        return self.priced_in_assessment in ("priced_in", "partially_priced")


class CoreThesis(BaseModel):
    """Single canonical decision answer rendered at the top of the dashboard.

    `conviction` was removed in the 2026 revamp: it was an LLM self-confidence
    label, not a market signal, so it no longer belongs on the decision surface.
    """

    one_liner: str = Field(..., description="One sentence that captures the thesis.")
    bull_case: str
    bear_case: str
    decision: Literal["Buy", "Monitor", "Avoid"]
    time_horizon: HorizonLiteral
    key_driver_signal_id: str = Field(..., description="signal_id of the primary bullish signal anchoring the thesis")
    key_risk_signal_id: str = Field(..., description="signal_id of the primary bearish signal anchoring the thesis")
    what_would_change_this: list[str] = Field(
        default_factory=list,
        description="3-5 falsification triggers; if any occurs, the thesis flips or weakens.",
    )


class TradingSignals(BaseModel):
    core_thesis: Optional[CoreThesis] = None
    bull_signals: list[Signal]
    bear_signals: list[Signal]
    direction: Literal["Bullish", "Neutral", "Bearish"]
    action: Literal["Buy", "Monitor", "Avoid"]
    reasoning_chain: list[str] = Field(
        default_factory=list,
        description="3-5 bullets forming a causal chain, not a paragraph.",
    )
    top_catalysts: list[str]
    balance_assessment: str
    signal_methodology: ScoreMethodology
