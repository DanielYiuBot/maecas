"""Smoke test for the 2026 dashboard revamp.

Builds a minimal AnalysisReport using the new schemas to confirm:
  - MethodologyEntry is wired through the report,
  - Signal carries a `source` field,
  - ExpectationBullet carries a `source` field,
  - CoreThesis no longer requires `conviction`,
  - The pipeline can serialize to JSON cleanly.
"""

from backend.schemas.report import AnalysisReport, MethodologyEntry
from backend.schemas.signals import TradingSignals, CoreThesis, Signal
from backend.schemas.sentiment import SentimentProfile, EvidenceCitation, ScoreMethodology
from backend.schemas.financials import StatedFinancials
from backend.schemas.market import MarketContext
from backend.schemas.guidance import GuidanceCatalysts
from backend.schemas.expectation import (
    ExpectationReality,
    ExpectationBullet,
    HiddenGem,
    PotentialRisk,
)
from backend.schemas.transcript import TranscriptMetadata


def main() -> None:
    sm = ScoreMethodology(metric="test", scale="1-10", inputs=["x"], heuristic="y")

    market = MarketContext(
        beat_miss_flags=[],
        price_pre_earnings_30d=None,
        price_post_earnings_10d=None,
        analyst_rec_summary=None,
        computed_metrics=[],
        balance_risks=[],
        lseg_available=False,
        confidence=0.5,
        low_confidence_flag=False,
        confidence_rationale="ok",
        methodology=sm,
    )

    sentiment = SentimentProfile(
        mgmt_confidence_presentation=7,
        mgmt_confidence_qa=6,
        hedging_frequency=4,
        analyst_skepticism=5,
        evasion_scores=[],
        register="confident",
        evidence_citations=[],
        confidence=0.8,
        low_confidence_flag=False,
        confidence_rationale="ok",
        score_methodology=[],
        stance_balance="balanced",
    )

    fin = StatedFinancials(
        figures=[],
        qa_only_figures=[],
        declined_to_quantify=[],
        guidance_ranges=[],
        confidence=0.7,
        low_confidence_flag=False,
    )

    gc = GuidanceCatalysts(
        explicit_guidance=[],
        implicit_signals=[],
        catalysts=[],
        surprise_gap_score=0.3,
        surprise_gap_methodology=sm,
    )

    sig = Signal(
        signal_id="s1",
        description="Test bull signal",
        claim_type="fact",
        novelty_status="new",
        evidence_citations=[
            EvidenceCitation(speaker="X", section="QA", utterance_index=0, quote="q")
        ],
        confidence=0.8,
        confidence_rationale="rationale",
        risk_tags=[],
        priority_tier="primary",
        source="LSEG",
    )

    ts = TradingSignals(
        core_thesis=CoreThesis(
            one_liner="thesis",
            bull_case="bull",
            bear_case="bear",
            decision="Buy",
            time_horizon="3-6m",
            key_driver_signal_id="s1",
            key_risk_signal_id="s1",
        ),
        bull_signals=[sig],
        bear_signals=[],
        direction="Bullish",
        action="Buy",
        top_catalysts=[],
        balance_assessment="ok",
        signal_methodology=sm,
    )

    md = TranscriptMetadata(
        event_id="e",
        company_name="TestCo",
        company_ticker="TST",
        ric=None,
        cusip=None,
        isin=None,
        event_type_id="e",
        event_date="2026-01-01",
        last_update="2026-01-01",
        expiration_date="2026-12-31",
        same_year_check=True,
        resolved_ric=None,
    )

    exp = ExpectationReality(
        pre_call_consensus_snapshot={"eps_fy1_mean": 1.0},
        what_changed_items=[
            ExpectationBullet(text="LSEG-anchored beat bullet", source="LSEG"),
            ExpectationBullet(text="Transcript-anchored shift bullet", source="Transcript"),
            ExpectationBullet(text="Synthesis-deduced bullet", source="Synthesis"),
        ],
        delta_magnitude="material",
        methodology=sm,
    )

    me = MethodologyEntry(
        panel="decision",
        score_or_bucket="Decision",
        inputs=["signals.core_thesis"],
        produced_by="alpha / agent_07_alpha.yaml",
        is_llm=True,
        prompt_summary="Alpha agent emits Buy/Monitor/Avoid from primary signal stack.",
        bucket_cutoffs="Buy / Monitor / Avoid",
        source="Synthesis",
    )

    cit = EvidenceCitation(speaker="Lip-Bu Tan", section="QA", utterance_index=12, quote="single mention")
    gem = HiddenGem(statement="A tiny but high-margin product line", why_it_matters="adds margin", mention_count=1, citations=[cit])
    risk = PotentialRisk(risk="Concentration on a single customer", why_it_matters="may invert thesis", severity="high", citations=[cit])

    report = AnalysisReport(
        job_id="j1",
        created_at="2026-01-01T00:00:00",
        metadata=md,
        sentiment=sentiment,
        financials=fin,
        market=market,
        guidance=gc,
        signals=ts,
        narrative=[],
        expectation_reality=exp,
        hidden_gems=[gem],
        potential_risks=[risk],
        methodology=[me],
    )

    payload = report.model_dump_json()
    print(f"AnalysisReport serialized OK | bytes={len(payload)}")
    print(f"methodology entries: {len(report.methodology)}")
    print(f"signal source: {report.signals.bull_signals[0].source}")
    print(
        f"expectation bullet sources: "
        f"{[b.source for b in report.expectation_reality.what_changed_items]}"
    )
    ct = report.signals.core_thesis
    has_conviction_attr = hasattr(ct, "conviction")
    print(f"CoreThesis has 'conviction' attr: {has_conviction_attr}")
    if has_conviction_attr:
        raise SystemExit(
            "FAIL: CoreThesis still has a 'conviction' attribute; the revamp expected it to be removed."
        )

    # Reload from JSON to verify roundtrip is clean
    reloaded = AnalysisReport.model_validate_json(payload)
    assert len(reloaded.methodology) == 1
    assert reloaded.signals.bull_signals[0].source == "LSEG"
    assert reloaded.expectation_reality.what_changed_items[0].source == "LSEG"
    assert len(reloaded.hidden_gems) == 1 and reloaded.hidden_gems[0].mention_count == 1
    assert len(reloaded.potential_risks) == 1 and reloaded.potential_risks[0].severity == "high"
    print("Roundtrip OK")


if __name__ == "__main__":
    main()
