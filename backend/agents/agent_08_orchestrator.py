"""Agent 8 — Orchestrator / Synthesis.

Receives all upstream schemas and produces the final AnalysisReport with:
  - composite scores (with prior-quarter anchors when available),
  - a short non-redundant narrative (what changed + what was downplayed),
  - hidden gems buried in the transcript,
  - a deterministic ValuationLinkage computed from guidance + LSEG consensus,
  - split pipeline warnings into model_warnings vs risk_flags.
"""

import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from backend.agents.base import BaseAgent
from backend.schemas.report import AnalysisReport, CompositeScore, NarrativeSection
from backend.schemas.market import MarketContext
from backend.schemas.signals import TradingSignals
from backend.schemas.sentiment import ScoreMethodology
from backend.schemas.expectation import (
    HiddenGem,
    ThesisMemory,
    ValuationLinkage,
    ValuationSensitivityRow,
)
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


class OrchestratorAgent(BaseAgent):
    prompt_file = "agent_08_orchestrator.yaml"
    output_schema = dict


_agent = OrchestratorAgent()


def _dedupe_warnings_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _valid_utterance_indexes(transcript) -> set[int]:
    if not transcript:
        return set()
    return {u.index for u in transcript.utterances}


def _audit_citations(transcript, signals: TradingSignals, narrative: list[NarrativeSection]) -> list[str]:
    warnings: list[str] = []
    valid_indexes = _valid_utterance_indexes(transcript)
    if not valid_indexes:
        return ["Grounding audit skipped: transcript utterance index map unavailable."]

    for bucket, label in ((signals.bull_signals, "bull"), (signals.bear_signals, "bear")):
        for sig in bucket:
            if not sig.evidence_citations:
                warnings.append(f"Grounding: {label} signal `{sig.signal_id}` has no evidence citations.")
                continue
            for cit in sig.evidence_citations:
                if cit.utterance_index not in valid_indexes:
                    warnings.append(
                        f"Grounding: {label} signal `{sig.signal_id}` cites missing utterance_index={cit.utterance_index}."
                    )

    for section in narrative:
        for claim in section.claims:
            if not claim.supporting_citations:
                warnings.append(f"Grounding: narrative section `{section.section}` contains uncited claim.")
                continue
            for cit in claim.supporting_citations:
                if cit.utterance_index not in valid_indexes:
                    warnings.append(
                        f"Grounding: narrative section `{section.section}` cites missing utterance_index={cit.utterance_index}."
                    )
    return warnings


_UNIT_TO_USD: dict[str, float] = {
    "usd": 1.0,
    "usd_raw": 1.0,
    "dollars": 1.0,
    "usd_thousands": 1_000.0,
    "usd_millions": 1_000_000.0,
    "usd_million": 1_000_000.0,
    "mm": 1_000_000.0,
    "usd_billions": 1_000_000_000.0,
    "usd_billion": 1_000_000_000.0,
    "bn": 1_000_000_000.0,
}


def _guess_usd_scale(mid: float, anchor: Optional[float]) -> tuple[float, str]:
    """Fallback when `unit` is missing: use an order-of-magnitude heuristic vs
    a reference anchor (LSEG consensus). Returns (scale_factor, reason)."""
    if anchor is None or anchor == 0:
        return 1.0, "no anchor available, treating value as raw USD"
    ratio = anchor / abs(mid) if mid != 0 else float("inf")
    if ratio > 500_000_000:
        return 1_000_000_000.0, "value looks ~1e9 smaller than consensus — scaled by 1e9 (billions)"
    if ratio > 500_000:
        return 1_000_000.0, "value looks ~1e6 smaller than consensus — scaled by 1e6 (millions)"
    if ratio > 500:
        return 1_000.0, "value looks ~1e3 smaller than consensus — scaled by 1e3 (thousands)"
    return 1.0, "value within same order of magnitude as consensus"


def _normalize_to_usd(g, anchor: Optional[float] = None) -> tuple[Optional[float], str]:
    """Convert a GuidanceRange midpoint to raw USD. Returns (mid_usd, reason)."""
    mid_raw: Optional[float] = None
    if g.low is not None and g.high is not None:
        mid_raw = (g.low + g.high) / 2
    elif g.low is not None:
        mid_raw = g.low
    elif g.high is not None:
        mid_raw = g.high
    if mid_raw is None:
        return None, "no numeric midpoint"

    unit_key = (g.unit or "").strip().lower()
    if unit_key in _UNIT_TO_USD:
        factor = _UNIT_TO_USD[unit_key]
        return mid_raw * factor, f"unit={g.unit}, factor={factor:g}"

    factor, why = _guess_usd_scale(mid_raw, anchor)
    return mid_raw * factor, f"unit missing; {why}"


import re

_QUARTERLY_RE = re.compile(r"\b(q[1-4]|fq[0-4]|quarter|quarterly)\b", re.IGNORECASE)
_ANNUAL_RE = re.compile(
    r"(full[\s-]?year|fiscal\s+year|annual(?:ly)?|calendar\s+(?:year|\d{4})|\bfy[\s-]*\d{2,4}\b)",
    re.IGNORECASE,
)


def _classify_timeline(timeline: str, metric: str) -> str:
    """Return 'quarterly', 'annual', or 'unclassified'. Quarterly wins on conflict
    because 'Q1 FY2027' means Q1 of fiscal 2027, not the whole fiscal year."""
    t = f"{timeline} {metric}"
    if _QUARTERLY_RE.search(t):
        return "quarterly"
    if _ANNUAL_RE.search(t):
        return "annual"
    return "unclassified"


def _pick_revenue_guidance(guidance) -> tuple[Optional[object], str, float]:
    """Pick the best revenue guidance for valuation comparison.
    Returns (guidance_obj, horizon_label, annualization_factor).
    """
    if not guidance or not guidance.explicit_guidance:
        return None, "none", 1.0

    rev_guides = [
        g for g in guidance.explicit_guidance
        if "revenue" in g.metric.lower() and (g.low is not None or g.high is not None)
    ]
    if not rev_guides:
        return None, "none", 1.0

    annuals = [g for g in rev_guides if _classify_timeline(g.timeline, g.metric) == "annual"]
    if annuals:
        return annuals[0], "annual", 1.0

    quarterlies = [g for g in rev_guides if _classify_timeline(g.timeline, g.metric) == "quarterly"]
    if quarterlies:
        return quarterlies[0], "quarterly_annualized_x4", 4.0

    return rev_guides[0], "unclassified", 1.0


def _pick_eps_guidance(guidance) -> Optional[object]:
    if not guidance or not guidance.explicit_guidance:
        return None
    for g in guidance.explicit_guidance:
        low = g.metric.lower()
        if "eps" in low or "earnings per share" in low:
            if g.low is not None or g.high is not None:
                return g
    return None


def _compute_valuation_linkage(guidance, lseg_data) -> Optional[ValuationLinkage]:
    """Translate transcript guidance vs consensus into implied upside and a simple
    bull/base/bear sensitivity matrix. No LLM — fully deterministic so the numbers
    can be audited.

    Handles three classes of defect that previously produced nonsense outputs:
      * unit mismatch (guidance in millions vs LSEG in raw dollars),
      * period mismatch (quarterly guide vs annual consensus),
      * missing EPS upside calculation.
    """
    if not lseg_data or not lseg_data.consensus:
        return None

    cons = lseg_data.consensus
    eps_fy1 = cons.eps_mean
    rev_fy1 = cons.revenue_mean
    ebitda_fy1 = cons.ebitda_mean

    implied_rev_pct: Optional[float] = None
    implied_eps_pct: Optional[float] = None
    rev_note = ""
    eps_note = ""

    rev_guide, rev_horizon, rev_factor = _pick_revenue_guidance(guidance)
    if rev_guide and rev_fy1:
        mid_usd, norm_reason = _normalize_to_usd(rev_guide, anchor=rev_fy1)
        if mid_usd is not None:
            mid_annualized = mid_usd * rev_factor
            implied_rev_pct = ((mid_annualized - rev_fy1) / rev_fy1) * 100
            rev_note = (
                f"Used {rev_guide.metric} ({rev_guide.timeline}) — horizon={rev_horizon}; "
                f"{norm_reason}"
            )

    eps_guide = _pick_eps_guidance(guidance)
    if eps_guide and eps_fy1:
        # EPS is usually emitted in raw dollars per share; no unit factor needed.
        mid_eps = None
        if eps_guide.low is not None and eps_guide.high is not None:
            mid_eps = (eps_guide.low + eps_guide.high) / 2
        elif eps_guide.low is not None:
            mid_eps = eps_guide.low
        elif eps_guide.high is not None:
            mid_eps = eps_guide.high
        if mid_eps is not None and eps_fy1 != 0:
            implied_eps_pct = ((mid_eps - eps_fy1) / eps_fy1) * 100
            eps_note = f"EPS from {eps_guide.metric} ({eps_guide.timeline}) vs consensus EPS mean"

    sensitivity: list[ValuationSensitivityRow] = [
        ValuationSensitivityRow(
            scenario="bull",
            rev_delta_pct=5.0,
            eps_delta_pct=12.0 if eps_fy1 else None,
            commentary="5% revenue beat typically flows through at ~2.4x operating leverage.",
        ),
        ValuationSensitivityRow(
            scenario="base",
            rev_delta_pct=0.0,
            eps_delta_pct=0.0,
            commentary="Consensus FY1 mid-point.",
        ),
        ValuationSensitivityRow(
            scenario="bear",
            rev_delta_pct=-5.0,
            eps_delta_pct=-12.0 if eps_fy1 else None,
            commentary="Symmetric downside assuming similar operating leverage.",
        ),
    ]

    multiple_parts: list[str] = []
    if rev_note:
        multiple_parts.append(rev_note)
    if eps_note:
        multiple_parts.append(eps_note)
    if not multiple_parts:
        multiple_parts.append("Consensus shown without a comparable revenue guidance range.")
    multiple_justification = " · ".join(multiple_parts)

    return ValuationLinkage(
        fy1_consensus_eps=eps_fy1,
        fy1_consensus_revenue=rev_fy1,
        fy1_consensus_ebitda=ebitda_fy1,
        implied_revenue_upside_pct=implied_rev_pct,
        implied_eps_upside_pct=implied_eps_pct,
        multiple_justification=multiple_justification,
        sensitivity=sensitivity,
        methodology=ScoreMethodology(
            metric="valuation_linkage",
            scale="percent_vs_consensus",
            inputs=[
                "guidance.explicit_guidance[*].unit",
                "lseg_data.consensus.revenue_mean",
                "lseg_data.consensus.eps_mean",
            ],
            heuristic=(
                "Pick the best-aligned revenue guidance (full-year preferred, else "
                "quarterly ×4). Normalize to raw USD using the extractor-emitted unit, "
                "falling back to a magnitude heuristic vs the LSEG anchor when unit is "
                "missing. Compare mid-point to FY1 revenue consensus. Apply the same "
                "extraction to EPS when present. Sensitivity rows apply symmetric "
                "+/-5% revenue shocks through a 2.4x operating leverage to EPS."
            ),
        ),
    )


def _classify_warnings(
    warnings: list[str],
    warning_split: dict,
) -> tuple[list[str], list[str]]:
    """Honor the LLM's split if every input warning is classified; else fall back
    to a keyword heuristic."""
    model_w_out = [str(s) for s in (warning_split.get("model_warnings") or []) if isinstance(s, (str, int, float))]
    risk_f_out = [str(s) for s in (warning_split.get("risk_flags") or []) if isinstance(s, (str, int, float))]
    covered = len(model_w_out) + len(risk_f_out)
    if covered >= len(warnings) and covered > 0:
        return model_w_out, risk_f_out

    model_keywords = (
        "grounding", "low confidence", "low_confidence", "uncited",
        "missing", "parser error", "agent error", "delta: missing",
        "lseg unavailable", "lseg fetch error", "fallback",
    )
    risk_keywords = (
        "accounting", "sbc", "stock-based", "revenue recognition",
        "china", "regulatory", "supply", "capex", "customer concentration",
    )
    model_w: list[str] = []
    risk_f: list[str] = []
    for w in warnings:
        low = w.lower()
        if any(k in low for k in risk_keywords):
            risk_f.append(w)
        elif any(k in low for k in model_keywords):
            model_w.append(w)
        else:
            model_w.append(w)
    return model_w, risk_f


def _composite_scores_with_prior(
    composite_scores: dict,
    thesis_memory,
    prior_sentiment,
) -> dict:
    """Attach prior_score to each composite score when we can infer it from
    stored thesis memory or the prior-quarter sentiment agent output."""
    if not composite_scores:
        return composite_scores

    prior_sentiment_score: Optional[int] = None
    if prior_sentiment is not None:
        avg = (prior_sentiment.mgmt_confidence_presentation + prior_sentiment.mgmt_confidence_qa) / 2
        prior_sentiment_score = int(round(avg))

    for key, raw in composite_scores.items():
        if not isinstance(raw, dict):
            continue
        if key == "sentiment" and prior_sentiment_score is not None and raw.get("prior_score") is None:
            raw["prior_score"] = prior_sentiment_score
    return composite_scores


def _jaccard_ids(a: list[str], b: list[str]) -> float:
    sa = set(a)
    sb = set(b)
    if not sa and not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _memory_with_current_thesis(thesis_memory: ThesisMemory | None, signals: TradingSignals | None) -> ThesisMemory | None:
    """Refine memory once the current thesis exists; the memory agent runs before alpha."""
    if not thesis_memory or not signals or not signals.core_thesis or not thesis_memory.prior_theses:
        return thesis_memory

    current = signals.core_thesis
    current_ids = [
        s.signal_id
        for s in (signals.bull_signals + signals.bear_signals)
        if s.priority_tier == "primary"
    ]
    latest = thesis_memory.prior_theses[0]
    flipped = {current.decision, latest.decision} == {"Buy", "Avoid"}
    same_decision = current.decision == latest.decision
    overlap = _jaccard_ids(current_ids, latest.primary_signal_ids)

    if flipped:
        thesis_memory.thesis_evolution = "reversed"
        thesis_memory.evolution_rationale = (
            f"Current {current.decision} thesis reverses the prior {latest.decision} call."
        )
    elif same_decision and overlap >= 0.5:
        thesis_memory.thesis_evolution = "reinforced"
        thesis_memory.evolution_rationale = (
            "Current thesis reinforces the prior call with overlapping primary signal IDs."
        )
    else:
        thesis_memory.thesis_evolution = "evolved"
        thesis_memory.evolution_rationale = (
            "Current thesis keeps prior context but changes the framing or primary signal mix."
        )
    return thesis_memory


async def run(state: GraphState) -> dict:
    t0 = time.perf_counter()
    job_id = state.get("job_id", "unknown")
    upstream_present = {
        "transcript": state.get("transcript") is not None,
        "sentiment": state.get("sentiment") is not None,
        "financials": state.get("financials") is not None,
        "market_context": state.get("market_context") is not None,
        "lseg_data": state.get("lseg_data") is not None,
        "guidance": state.get("guidance") is not None,
        "delta": state.get("delta") is not None,
        "signals": state.get("signals") is not None,
        "expectation": state.get("expectation_reality") is not None,
    }
    logger.info("agent_08_orchestrator START | job_id=%s | upstream=%s", job_id, upstream_present)

    warnings = list(state.get("pipeline_warnings") or [])
    new_state_warnings: list[str] = []
    progress = state.get("progress_callback")

    if progress:
        await progress(stage="agents", agent="orchestrator", status="running", progress_pct=85, message="Synthesizing final report...")

    transcript = state.get("transcript")
    sentiment = state.get("sentiment")
    prior_sentiment = state.get("prior_sentiment")
    financials = state.get("financials")
    market_context = state.get("market_context")
    lseg_data = state.get("lseg_data")
    guidance = state.get("guidance")
    delta = state.get("delta")
    signals = state.get("signals")
    expectation = state.get("expectation_reality")
    thesis_memory = state.get("thesis_memory")

    if sentiment and sentiment.low_confidence_flag:
        w = "Low confidence: Sentiment analysis"
        warnings.append(w)
        new_state_warnings.append(w)
    if financials and financials.low_confidence_flag:
        w = "Low confidence: Financial extraction"
        warnings.append(w)
        new_state_warnings.append(w)
    if market_context and market_context.low_confidence_flag:
        w = "Low confidence: Market context"
        warnings.append(w)
        new_state_warnings.append(w)
        logger.info(
            "Orchestrator | %s | lseg_available=%s market_confidence=%.2f",
            w,
            market_context.lseg_available,
            market_context.confidence,
        )

    try:
        system, user, provider, model = _agent.load_prompt(
            company_name=transcript.metadata.company_name if transcript else "Unknown",
            ticker=transcript.metadata.company_ticker if transcript else "",
            job_id=job_id,
            metadata_json=json.dumps(transcript.metadata.model_dump(), indent=2) if transcript else "null",
            sentiment_json=json.dumps(sentiment.model_dump(), indent=2) if sentiment else "null",
            financials_json=json.dumps(financials.model_dump(), indent=2) if financials else "null",
            market_json=json.dumps(market_context.model_dump(), indent=2) if market_context else "null",
            guidance_json=json.dumps(guidance.model_dump(), indent=2) if guidance else "null",
            expectation_json=json.dumps(expectation.model_dump(), indent=2) if expectation else "null",
            delta_json=json.dumps(delta.model_dump(), indent=2) if delta else "null",
            signals_json=json.dumps(signals.model_dump(), indent=2) if signals else "null",
            warnings_json=json.dumps(warnings),
        )

        data = await _agent.call(system, user, provider, model)

        composite_scores = data.get("composite_scores", {})
        composite_scores = _composite_scores_with_prior(composite_scores, thesis_memory, prior_sentiment)

        narrative_data = data.get("narrative", [])
        hidden_gems_data = data.get("hidden_gems", [])
        warning_split = data.get("warning_split", {}) or {}
        additional_warnings = data.get("additional_warnings", [])
        for aw in additional_warnings:
            if aw not in warnings:
                warnings.append(aw)
                new_state_warnings.append(aw)

        warnings = _dedupe_warnings_preserve_order(warnings)

        if not composite_scores:
            composite_scores = {
                key: {
                    "score": 5,
                    "key_drivers": ["Fallback score due to synthesis failure."],
                    "methodology": {
                        "metric": key,
                        "scale": "1-10",
                        "inputs": ["upstream agent outputs"],
                        "heuristic": "Default midpoint assigned when orchestrator output omitted this score.",
                    },
                }
                for key in ["sentiment", "financials", "guidance", "risk", "momentum"]
            }
        normalized_scores = {k: CompositeScore.model_validate(v) for k, v in composite_scores.items()}

        narrative_payload = narrative_data if isinstance(narrative_data, list) else []
        narrative = [NarrativeSection.model_validate(x) for x in narrative_payload]

        hidden_gems: list[HiddenGem] = []
        if isinstance(hidden_gems_data, list):
            for gem in hidden_gems_data:
                try:
                    hidden_gems.append(HiddenGem.model_validate(gem))
                except Exception as gerr:
                    logger.debug("Orchestrator | bad hidden_gem payload: %s", gerr)

        if not market_context:
            market_context = MarketContext(
                beat_miss_flags=[], price_pre_earnings_30d=None,
                price_post_earnings_10d=None, analyst_rec_summary=None,
                computed_metrics=[], balance_risks=["market_data_unavailable"],
                lseg_available=False, confidence=0.0, low_confidence_flag=True,
                confidence_rationale="Market context unavailable in orchestrator fallback.",
                methodology=ScoreMethodology(
                    metric="market_context_confidence",
                    scale="0-1",
                    inputs=["market_context"],
                    heuristic="Fallback value when market context is unavailable at synthesis time.",
                ),
            )
        if not signals:
            signals = TradingSignals(
                core_thesis=None,
                bull_signals=[], bear_signals=[], direction="Neutral",
                action="Monitor",
                reasoning_chain=["Insufficient data for signal generation."],
                top_catalysts=[],
                balance_assessment="Fallback due to missing signal payload.",
                signal_methodology=ScoreMethodology(
                    metric="signal_generation",
                    scale="qualitative",
                    inputs=["sentiment", "market_context", "guidance", "delta"],
                    heuristic="Fallback neutral stance when signal generation is unavailable.",
                ),
            )
        thesis_memory = _memory_with_current_thesis(thesis_memory, signals)
        if not narrative:
            narrative = [
                NarrativeSection(
                    section="what_changed",
                    summary="Synthesis output unavailable; review upstream sections directly.",
                    claims=[],
                )
            ]
        warnings.extend(_audit_citations(transcript, signals, narrative))
        if signals.direction == "Bullish" and not signals.bear_signals:
            warnings.append("Balance: bullish stance without bear signals after synthesis.")

        # ValuationLinkage panel was removed from the dashboard because translating
        # transcript guidance into implied % upside vs consensus is too prone to
        # unit-scaling hallucination to ship as a quantitative output. The schema
        # field is left in place for backward compatibility with stored jobs.
        valuation_linkage = None

        warnings = _dedupe_warnings_preserve_order(warnings)
        model_warnings, risk_flags = _classify_warnings(warnings, warning_split)

        report = AnalysisReport(
            job_id=job_id,
            created_at=datetime.now(timezone.utc).isoformat(),
            metadata=transcript.metadata if transcript else None,
            sentiment=sentiment,
            financials=financials,
            market=market_context,
            lseg_data=lseg_data,
            guidance=guidance,
            delta=delta,
            signals=signals,
            composite_scores=normalized_scores,
            narrative=narrative,
            expectation_reality=expectation,
            valuation_linkage=valuation_linkage,
            hidden_gems=hidden_gems,
            thesis_memory=thesis_memory,
            pipeline_warnings=warnings,
            model_warnings=model_warnings,
            risk_flags=risk_flags,
            transcript_utterances=list(transcript.utterances) if transcript else [],
        )

        if progress:
            await progress(stage="agents", agent="orchestrator", status="complete", progress_pct=95, message="Report assembled — saving results...")

        elapsed = time.perf_counter() - t0
        logger.info(
            "agent_08_orchestrator DONE | job_id=%s | duration=%.2fs | scores=%s | warnings=%d (model=%d, risk=%d) | gems=%d | valuation=%s",
            job_id, elapsed, list(composite_scores.keys()), len(warnings),
            len(model_warnings), len(risk_flags), len(hidden_gems),
            valuation_linkage is not None,
        )
        return {"report": report, "pipeline_warnings": new_state_warnings}

    except Exception as e:
        elapsed = time.perf_counter() - t0
        logger.error("agent_08_orchestrator FAILED | job_id=%s | duration=%.2fs | error=%s", job_id, elapsed, e, exc_info=True)
        err = f"Orchestrator error: {e}"
        warnings.append(err)
        warnings = _dedupe_warnings_preserve_order(warnings)

        # Degrade gracefully when LLM synthesis emits malformed JSON.
        # We still have upstream agent outputs, so return a usable report
        # instead of failing the whole pipeline in the final step.
        if transcript and sentiment and financials and guidance and market_context and signals:
            fallback_scores = {
                key: CompositeScore(
                    score=5,
                    key_drivers=["Fallback midpoint due to orchestrator parse failure."],
                    methodology=ScoreMethodology(
                        metric=key,
                        scale="1-10",
                        inputs=["upstream agent outputs"],
                        heuristic="Default midpoint assigned when orchestrator output was invalid JSON.",
                    ),
                )
                for key in ["sentiment", "financials", "guidance", "risk", "momentum"]
            }
            fallback_narrative = [
                NarrativeSection(
                    section="what_changed",
                    summary="Final synthesis JSON was invalid for this run; use upstream panels for details.",
                    claims=[],
                ),
                NarrativeSection(
                    section="management_downplayed",
                    summary="Downplayed-items synthesis unavailable due to malformed orchestrator payload.",
                    claims=[],
                ),
            ]
            model_warnings, risk_flags = _classify_warnings(
                warnings,
                {"model_warnings": warnings, "risk_flags": []},
            )
            report = AnalysisReport(
                job_id=job_id,
                created_at=datetime.now(timezone.utc).isoformat(),
                metadata=transcript.metadata,
                sentiment=sentiment,
                financials=financials,
                market=market_context,
                lseg_data=lseg_data,
                guidance=guidance,
                delta=delta,
                signals=signals,
                composite_scores=fallback_scores,
                narrative=fallback_narrative,
                expectation_reality=expectation,
                valuation_linkage=None,
                hidden_gems=[],
                thesis_memory=_memory_with_current_thesis(thesis_memory, signals),
                pipeline_warnings=warnings,
                model_warnings=model_warnings,
                risk_flags=risk_flags,
                transcript_utterances=list(transcript.utterances),
            )
            if progress:
                await progress(
                    stage="agents",
                    agent="orchestrator",
                    status="complete",
                    progress_pct=95,
                    message="Report assembled with fallback synthesis.",
                )
            return {"report": report, "pipeline_warnings": [err]}

        if progress:
            await progress(stage="error", agent="orchestrator", status="error", progress_pct=100, message=str(e))
        return {"pipeline_warnings": [err]}
