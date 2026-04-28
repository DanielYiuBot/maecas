"""Agent 8 — Orchestrator / Synthesis.

Receives all upstream schemas and produces the final AnalysisReport with:
  - a short non-redundant narrative (what changed + what was downplayed,
    each claim source-tagged so the Highlight panel knows where to put it),
  - a deterministic per-panel `methodology` payload that powers the
    context-aware Methodology drawer on the frontend,
  - a split of accumulated pipeline warnings into model_warnings (engineer
    diagnostics) vs risk_flags (thesis-relevant caveats).

The 2026 revamp removed `composite_scores`, `valuation_linkage`, and
`hidden_gems` from this agent's responsibilities. Composite scores were
dashboard-orphaned, valuation_linkage proved too prone to unit-scaling
hallucination to ship, and hidden gems generated noisy "single-mention"
threads that were rarely actionable. The orchestrator now focuses on
narrative + methodology + warning classification only.
"""

import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from backend.agents.base import BaseAgent
from backend.schemas.report import (
    AnalysisReport,
    MethodologyEntry,
    NarrativeClaim,
    NarrativeSection,
)
from backend.schemas.expectation import HiddenGem, PotentialRisk
from backend.schemas.market import MarketContext
from backend.schemas.signals import TradingSignals
from backend.schemas.sentiment import ScoreMethodology
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


# Static lookup table that drives the deterministic _build_methodology() pass.
# Each entry corresponds to a single renderable score / bucket on the 6-panel
# dashboard. Adding a new score on the frontend means adding an entry here.
_METHODOLOGY_TABLE: list[dict] = [
    {
        "panel": "summary",
        "score_or_bucket": "Hidden gems / Potential risks",
        "inputs": ["sentiment", "delta", "signals", "guidance", "expectation_reality"],
        "produced_by": "synthesize / agent_08_orchestrator.yaml",
        "is_llm": True,
        "prompt_summary": (
            "Surfaces 1-3 statements buried deep or mentioned only once in the call "
            "that are not already promoted as primary signals or top catalysts, plus "
            "1-3 risks the LLM judges material that the bull/bear stack may underweight."
        ),
        "bucket_cutoffs": "Severity for potential_risks: low / medium / high.",
        "source": "Synthesis",
    },
    {
        "panel": "decision",
        "score_or_bucket": "Decision",
        "inputs": [
            "signals.core_thesis",
            "signals.bull_signals",
            "signals.bear_signals",
            "expectation_reality.delta_magnitude",
        ],
        "produced_by": "alpha / agent_07_alpha.yaml",
        "is_llm": True,
        "prompt_summary": (
            "Alpha agent reads sentiment, market context, guidance, expectation-vs-reality, "
            "and QoQ delta; classifies each candidate signal into primary/secondary/noise "
            "with at most three primary; then emits a Buy/Monitor/Avoid decision anchored "
            "on the primary stack."
        ),
        "bucket_cutoffs": "Buy / Monitor / Avoid (categorical, no numeric cutoffs).",
        "source": "Synthesis",
    },
    {
        "panel": "summary",
        "score_or_bucket": "Top bull / bear signals",
        "inputs": ["signals.bull_signals[priority_tier=primary]", "signals.bear_signals[priority_tier=primary]"],
        "produced_by": "alpha / agent_07_alpha.yaml",
        "is_llm": True,
        "prompt_summary": (
            "Bull/bear primary tier holds at most three signals total. Each carries a "
            "so_what consequence, evidence citations, a P&L linkage, a horizon, and a "
            "priced-in assessment grounded in LSEG consensus when available."
        ),
        "bucket_cutoffs": "Tiering: Primary / Secondary / Noise (Noise hidden from dashboard surface).",
        "source": "Synthesis",
    },
    {
        "panel": "lseg",
        "score_or_bucket": "Surprise %",
        "inputs": ["lseg_data.estimates_surprise_fy0.eps", "lseg_data.estimates_surprise_fy0.revenue"],
        "produced_by": "lseg fetch (deterministic)",
        "is_llm": False,
        "prompt_summary": (
            "Computed by the LSEG service: (actual - mean_estimate) / mean_estimate, then "
            "standardized via SUE = surprise / estimate dispersion."
        ),
        "bucket_cutoffs": "|SUE| < 1 in line, 1-2 meaningful, >2 large surprise.",
        "source": "LSEG",
    },
    {
        "panel": "lseg",
        "score_or_bucket": "Stated vs consensus (beat/miss flags)",
        "inputs": ["financials.figures", "lseg_data.consensus", "market.beat_miss_flags"],
        "produced_by": "market_ctx / agent_04_market.yaml",
        "is_llm": True,
        "prompt_summary": (
            "Reconciles transcript-stated figures against LSEG consensus where the metrics "
            "match; emits beat/miss direction with the surprise % attached."
        ),
        "bucket_cutoffs": "Direction: beat / miss / inline.",
        "source": "LSEG",
    },
    {
        "panel": "sentiment",
        "score_or_bucket": "Tone",
        "inputs": ["sentiment.mgmt_confidence_presentation", "sentiment.mgmt_confidence_qa"],
        "produced_by": "sentiment_agent / agent_02_sentiment_synthesis.yaml",
        "is_llm": True,
        "prompt_summary": (
            "Average of management confidence in Presentation and Q&A on a 1-10 scale; "
            "synthesized from the chunked QA passes plus presentation pass."
        ),
        "bucket_cutoffs": "<=3 Defensive, 4-6 Mixed, 7-10 Confident.",
        "source": "Transcript",
    },
    {
        "panel": "sentiment",
        "score_or_bucket": "Hedging",
        "inputs": ["sentiment.hedging_frequency"],
        "produced_by": "sentiment_agent / agent_02_sentiment_synthesis.yaml",
        "is_llm": True,
        "prompt_summary": "Frequency of qualifier words on a 1-10 scale; higher = more hedging language.",
        "bucket_cutoffs": "<=3 Direct, 4-6 Some hedging, 7-10 Heavy hedging.",
        "source": "Transcript",
    },
    {
        "panel": "sentiment",
        "score_or_bucket": "Evasion",
        "inputs": ["sentiment.evasion_scores"],
        "produced_by": "sentiment_agent / agent_02_sentiment_qa_batch.yaml",
        "is_llm": True,
        "prompt_summary": (
            "Per-question evasion score 0-5. The dashboard collapses this into the share "
            "of analyst questions where management got an evasion score >= 3."
        ),
        "bucket_cutoffs": "Share of evasive answers: <20% Low, 20-49% Medium, >=50% High.",
        "source": "Transcript",
    },
    {
        "panel": "qoq",
        "score_or_bucket": "Hedging drift",
        "inputs": ["delta.language_drift.hedging_drift"],
        "produced_by": "delta_agent (deterministic word-rate diff)",
        "is_llm": False,
        "prompt_summary": (
            "Difference in hedge-word frequency per 1k words between current and prior "
            "transcripts. Positive = more hedging this quarter."
        ),
        "bucket_cutoffs": "|drift| <= 0.5 within noise; >0.5 meaningful shift.",
        "source": "Transcript",
    },
    {
        "panel": "qoq",
        "score_or_bucket": "Topic deltas",
        "inputs": ["delta.topic_deltas", "delta.topic_trajectory"],
        "produced_by": "delta_agent / agent_06_delta_pairwise.yaml + agent_06_delta_trend.yaml",
        "is_llm": True,
        "prompt_summary": (
            "Per-topic comparison vs each prior quarter: novelty status (new / repeated / "
            "de-emphasized / resolved) plus a sentiment delta in -1..+1."
        ),
        "bucket_cutoffs": "Sentiment delta: |x|<0.25 unchanged, 0.25-0.6 shift, >=0.6 strong shift.",
        "source": "Transcript",
    },
    {
        "panel": "guidance",
        "score_or_bucket": "Guidance specificity",
        "inputs": [
            "guidance.explicit_guidance",
            "delta.guidance_specificity_delta",
        ],
        "produced_by": "guidance_agent / agent_05_guidance.yaml",
        "is_llm": True,
        "prompt_summary": (
            "Share of explicit guidance items that have both a low and a high range; "
            "delta vs prior quarter is emitted by the delta agent."
        ),
        "bucket_cutoffs": "Share concrete: <20% Low, 20-49% Medium, >=50% High.",
        "source": "Transcript",
    },
]


def _classify_caveat_panel(caveat: str) -> str:
    """Heuristically map a free-text pipeline warning to a panel key for caveat
    routing in the methodology drawer."""
    low = caveat.lower()
    if any(k in low for k in ("sentiment", "qa coverage", "speaker tone", "evasion")):
        return "sentiment"
    if any(k in low for k in ("delta", "qoq", "language drift", "topic")):
        return "qoq"
    if any(k in low for k in ("guidance", "catalyst", "surprise gap")):
        return "guidance"
    if any(k in low for k in ("market", "lseg", "consensus", "beat", "miss")):
        return "lseg"
    if any(k in low for k in ("alpha", "signal", "thesis", "core_thesis", "decision")):
        return "decision"
    return "summary"


def _build_methodology(
    sentiment,
    delta,
    signals,
    guidance,
    market_context,
    lseg_data,
    expectation,
    pipeline_warnings: list[str],
) -> list[MethodologyEntry]:
    """Deterministically assemble the per-panel methodology payload that powers
    the Methodology drawer.

    No LLM call: the drawer is a transparency surface, so it must be
    auditable and stable. Inputs/cutoffs come from `_METHODOLOGY_TABLE`;
    raw scores are pulled from upstream schemas; caveats are routed from
    `pipeline_warnings` by keyword.
    """
    raw_scores: dict[tuple[str, str], Optional[float]] = {}
    if sentiment is not None:
        avg_tone = (sentiment.mgmt_confidence_presentation + sentiment.mgmt_confidence_qa) / 2
        raw_scores[("sentiment", "Tone")] = float(avg_tone)
        raw_scores[("sentiment", "Hedging")] = float(sentiment.hedging_frequency)
        if sentiment.evasion_scores:
            hot = sum(1 for e in sentiment.evasion_scores if e.score >= 3)
            raw_scores[("sentiment", "Evasion")] = hot / max(1, len(sentiment.evasion_scores))
        else:
            raw_scores[("sentiment", "Evasion")] = 0.0
    if delta and delta.language_drift:
        raw_scores[("qoq", "Hedging drift")] = float(delta.language_drift.hedging_drift)
    if guidance is not None:
        if guidance.explicit_guidance:
            concrete = sum(1 for g in guidance.explicit_guidance if g.low is not None and g.high is not None)
            raw_scores[("guidance", "Guidance specificity")] = concrete / max(1, len(guidance.explicit_guidance))
    if lseg_data and lseg_data.estimates_surprise_fy0:
        rev = lseg_data.estimates_surprise_fy0.revenue
        if rev and rev.surprise_pct is not None:
            raw_scores[("lseg", "Surprise %")] = float(rev.surprise_pct)

    caveats_by_panel: dict[str, list[str]] = {}
    for w in pipeline_warnings:
        panel = _classify_caveat_panel(w)
        caveats_by_panel.setdefault(panel, []).append(w)

    out: list[MethodologyEntry] = []
    for entry in _METHODOLOGY_TABLE:
        key = (entry["panel"], entry["score_or_bucket"])
        out.append(
            MethodologyEntry(
                panel=entry["panel"],
                score_or_bucket=entry["score_or_bucket"],
                inputs=list(entry["inputs"]),
                produced_by=entry["produced_by"],
                is_llm=entry["is_llm"],
                prompt_summary=entry["prompt_summary"],
                bucket_cutoffs=entry.get("bucket_cutoffs"),
                source=entry.get("source", "Synthesis"),
                raw_score=raw_scores.get(key),
                caveats=list(caveats_by_panel.get(entry["panel"], [])),
            )
        )

    if signals and signals.core_thesis:
        for entry in out:
            if entry.panel == "decision" and entry.score_or_bucket == "Decision":
                entry.caveats = list(set(entry.caveats))

    return out


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
    financials = state.get("financials")
    market_context = state.get("market_context")
    lseg_data = state.get("lseg_data")
    guidance = state.get("guidance")
    delta = state.get("delta")
    signals = state.get("signals")
    expectation = state.get("expectation_reality")

    if sentiment and sentiment.low_confidence_flag:
        w = "Low confidence: Sentiment analysis"
        warnings.append(w)
        new_state_warnings.append(w)
    if sentiment and sentiment.sentiment_stability and sentiment.sentiment_stability.warnings:
        for sw in sentiment.sentiment_stability.warnings:
            msg = f"Sentiment stability: {sw}"
            warnings.append(msg)
            new_state_warnings.append(msg)
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
    if delta and delta.stability_checks:
        for dw in delta.stability_checks.low_confidence_reasons[:3]:
            msg = f"QoQ stability: {dw}"
            warnings.append(msg)
            new_state_warnings.append(msg)

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

        narrative_data = data.get("narrative", [])
        hidden_gems_data = data.get("hidden_gems", []) or []
        potential_risks_data = data.get("potential_risks", []) or []
        warning_split = data.get("warning_split", {}) or {}
        additional_warnings = data.get("additional_warnings", [])
        for aw in additional_warnings:
            if aw not in warnings:
                warnings.append(aw)
                new_state_warnings.append(aw)

        warnings = _dedupe_warnings_preserve_order(warnings)

        narrative_payload = narrative_data if isinstance(narrative_data, list) else []
        narrative: list[NarrativeSection] = []
        for raw_section in narrative_payload:
            try:
                claims_payload = raw_section.get("claims") or []
                normalized_claims: list[NarrativeClaim] = []
                for raw_claim in claims_payload:
                    if not isinstance(raw_claim, dict):
                        continue
                    if "source" not in raw_claim:
                        raw_claim["source"] = "Synthesis"
                    try:
                        normalized_claims.append(NarrativeClaim.model_validate(raw_claim))
                    except Exception as cerr:
                        logger.debug("Orchestrator | bad narrative claim: %s", cerr)
                normalized_section = {
                    "section": raw_section.get("section", "what_changed"),
                    "summary": raw_section.get("summary", ""),
                    "claims": [c.model_dump() for c in normalized_claims],
                }
                narrative.append(NarrativeSection.model_validate(normalized_section))
            except Exception as serr:
                logger.debug("Orchestrator | bad narrative section: %s", serr)

        hidden_gems: list[HiddenGem] = []
        for gem in hidden_gems_data if isinstance(hidden_gems_data, list) else []:
            try:
                hidden_gems.append(HiddenGem.model_validate(gem))
            except Exception as gerr:
                logger.debug("Orchestrator | bad hidden_gem: %s", gerr)

        potential_risks: list[PotentialRisk] = []
        for risk in potential_risks_data if isinstance(potential_risks_data, list) else []:
            try:
                potential_risks.append(PotentialRisk.model_validate(risk))
            except Exception as rerr:
                logger.debug("Orchestrator | bad potential_risk: %s", rerr)

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

        warnings = _dedupe_warnings_preserve_order(warnings)
        model_warnings, risk_flags = _classify_warnings(warnings, warning_split)

        methodology = _build_methodology(
            sentiment=sentiment,
            delta=delta,
            signals=signals,
            guidance=guidance,
            market_context=market_context,
            lseg_data=lseg_data,
            expectation=expectation,
            pipeline_warnings=warnings,
        )

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
            narrative=narrative,
            expectation_reality=expectation,
            hidden_gems=hidden_gems,
            potential_risks=potential_risks,
            methodology=methodology,
            pipeline_warnings=warnings,
            model_warnings=model_warnings,
            risk_flags=risk_flags,
            transcript_utterances=list(transcript.utterances) if transcript else [],
        )

        if progress:
            await progress(stage="agents", agent="orchestrator", status="complete", progress_pct=95, message="Report assembled — saving results...")

        elapsed = time.perf_counter() - t0
        logger.info(
            "agent_08_orchestrator DONE | job_id=%s | duration=%.2fs | warnings=%d (model=%d, risk=%d) | methodology=%d | gems=%d | potential_risks=%d",
            job_id, elapsed, len(warnings),
            len(model_warnings), len(risk_flags), len(methodology),
            len(hidden_gems), len(potential_risks),
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
            methodology = _build_methodology(
                sentiment=sentiment,
                delta=delta,
                signals=signals,
                guidance=guidance,
                market_context=market_context,
                lseg_data=lseg_data,
                expectation=expectation,
                pipeline_warnings=warnings,
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
                narrative=fallback_narrative,
                expectation_reality=expectation,
                hidden_gems=[],
                potential_risks=[],
                methodology=methodology,
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
