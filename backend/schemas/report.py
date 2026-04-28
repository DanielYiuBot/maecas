from pydantic import BaseModel, Field
from typing import Literal, Optional

from backend.schemas.transcript import TranscriptMetadata, Utterance
from backend.schemas.sentiment import SentimentProfile
from backend.schemas.financials import StatedFinancials
from backend.schemas.market import MarketContext, LSEGMarketData
from backend.schemas.guidance import GuidanceCatalysts
from backend.schemas.delta import QoQDelta
from backend.schemas.signals import TradingSignals
from backend.schemas.sentiment import EvidenceCitation
from backend.schemas.expectation import ExpectationReality, HiddenGem, PotentialRisk

SourceTag = Literal["LSEG", "Transcript", "Synthesis"]
PanelKey = Literal["decision", "summary", "lseg", "sentiment", "qoq", "guidance"]


class NarrativeClaim(BaseModel):
    text: str
    claim_type: Literal["fact", "inference", "speculation"]
    numeric_anchor: Optional[str] = None
    source: SourceTag = Field(
        default="Synthesis",
        description=(
            "Where the claim's evidence comes from: LSEG (objective market data), "
            "Transcript (stated by management with a citation), or Synthesis (LLM "
            "combined the two)."
        ),
    )
    supporting_citations: list[EvidenceCitation]


class NarrativeSection(BaseModel):
    section: str
    summary: str
    claims: list[NarrativeClaim]


class MethodologyEntry(BaseModel):
    """One per renderable score / bucket / decision on the dashboard.

    Drives the context-aware Methodology drawer. Built deterministically in
    the orchestrator (see `_build_methodology` in
    `backend/agents/agent_08_orchestrator.py`) from a static lookup table plus
    upstream prompt YAML metadata, so the audit trail is trustworthy and does
    not require an extra LLM call.
    """

    panel: PanelKey
    score_or_bucket: str = Field(
        ...,
        description="Display label of the score/bucket as shown on the surface (e.g. 'Tone', 'Decision', 'Surprise %').",
    )
    inputs: list[str] = Field(
        default_factory=list,
        description="Upstream report fields that fed this score (e.g. 'sentiment.mgmt_confidence_qa').",
    )
    produced_by: str = Field(
        ...,
        description="Graph node + prompt YAML, e.g. 'sentiment_agent / agent_02_sentiment_synthesis.yaml'.",
    )
    is_llm: bool = Field(
        ...,
        description="True when an LLM emitted the value; false for deterministic computations.",
    )
    prompt_summary: str = Field(
        default="",
        description="One-paragraph distillation of the system prompt (LLM only) or computation (deterministic).",
    )
    bucket_cutoffs: Optional[str] = Field(
        default=None,
        description="Cutoffs the UI uses to bucket the value, e.g. '<=3 Low, 4-6 Medium, 7-10 High'.",
    )
    source: SourceTag = Field(
        default="Synthesis",
        description="Whether the score is anchored on LSEG data, transcript, or LLM synthesis.",
    )
    raw_score: Optional[float] = Field(
        default=None,
        description="Raw numeric score for audit. Hidden from the dashboard surface; only shown in the drawer.",
    )
    caveats: list[str] = Field(
        default_factory=list,
        description="Caveats inherited from pipeline_warnings tagged to this panel/score.",
    )


class AnalysisReport(BaseModel):
    """Final dashboard-facing payload.

    The 2026 revamp removed `composite_scores`, `valuation_linkage`, and
    `hidden_gems` from this schema — none had a UI binding and they added
    audit surface without value. `methodology` replaces them as the single
    transparency channel; `model_warnings` and `risk_flags` are no longer
    rendered as standalone panels and live only inside the drawer's caveats.
    """

    job_id: str
    created_at: str
    metadata: TranscriptMetadata
    sentiment: SentimentProfile
    financials: StatedFinancials
    market: MarketContext
    lseg_data: Optional[LSEGMarketData] = None
    guidance: GuidanceCatalysts
    delta: Optional[QoQDelta] = None
    signals: TradingSignals
    narrative: list[NarrativeSection] = Field(default_factory=list)

    expectation_reality: Optional[ExpectationReality] = None

    hidden_gems: list[HiddenGem] = Field(
        default_factory=list,
        description=(
            "Statements buried deep or mentioned only once that materially affect "
            "the thesis. Surfaced on the Summary panel under 'Under-discussed threads'."
        ),
    )
    potential_risks: list[PotentialRisk] = Field(
        default_factory=list,
        description=(
            "Risks the LLM judges material but that the bull/bear signal stack may "
            "underweight. Surfaced on the Summary panel as a sibling section to "
            "hidden_gems."
        ),
    )

    methodology: list[MethodologyEntry] = Field(
        default_factory=list,
        description="Per-panel methodology entries powering the context-aware Methodology drawer.",
    )

    pipeline_warnings: list[str] = Field(default_factory=list)
    model_warnings: list[str] = Field(
        default_factory=list,
        description="Things the model is uncertain about (grounding, low-confidence, missing citations). Rendered only in the Methodology drawer.",
    )
    risk_flags: list[str] = Field(
        default_factory=list,
        description="Things that matter to the investment thesis (accounting changes, SBC, thesis caveats). Rendered as a small Decision footer chip and inside the Methodology drawer.",
    )

    transcript_utterances: list[Utterance] = Field(
        default_factory=list,
        description="Full structured utterances from the parsed transcript, included so the UI can click-to-quote.",
    )
