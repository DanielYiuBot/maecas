"""Agent 7 — Alpha Signal Generator.

Synthesizes sentiment, market context, guidance, expectation-vs-reality,
and delta (optional) into actionable trading signals, a ranked signal
hierarchy, and a canonical Core Thesis.
"""

import json
import logging
import time

from backend.agents.base import BaseAgent
from backend.schemas.signals import TradingSignals
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


class AlphaAgent(BaseAgent):
    prompt_file = "agent_07_alpha.yaml"
    output_schema = TradingSignals


_agent = AlphaAgent()


def _validate_core_thesis(signals: TradingSignals) -> list[str]:
    """Assert that core_thesis references existing signal_ids."""
    warnings: list[str] = []
    ct = signals.core_thesis
    if not ct:
        warnings.append("Alpha: core_thesis missing from model output.")
        return warnings

    all_ids = {s.signal_id for s in signals.bull_signals + signals.bear_signals}
    if ct.key_driver_signal_id and ct.key_driver_signal_id not in all_ids:
        warnings.append(
            f"Grounding: core_thesis.key_driver_signal_id='{ct.key_driver_signal_id}' does not match any extracted signal."
        )
    if ct.key_risk_signal_id and ct.key_risk_signal_id not in all_ids:
        warnings.append(
            f"Grounding: core_thesis.key_risk_signal_id='{ct.key_risk_signal_id}' does not match any extracted signal."
        )
    return warnings


def _enforce_tier_cap(signals: TradingSignals) -> list[str]:
    """The prompt says max 3 primary; enforce it in code as a safety net."""
    warnings: list[str] = []
    primary = [s for s in signals.bull_signals + signals.bear_signals if s.priority_tier == "primary"]
    if len(primary) > 3:
        by_conf = sorted(primary, key=lambda s: s.confidence, reverse=True)
        to_demote = set(s.signal_id for s in by_conf[3:])
        for bucket in (signals.bull_signals, signals.bear_signals):
            for s in bucket:
                if s.signal_id in to_demote:
                    s.priority_tier = "secondary"
        warnings.append(
            f"Alpha: demoted {len(to_demote)} primary signals to secondary (enforced max 3)."
        )
    return warnings


async def run(state: GraphState) -> dict:
    t0 = time.perf_counter()
    job_id = state.get("job_id", "unknown")
    logger.info(
        "agent_07_alpha START | job_id=%s | has_sentiment=%s | has_market=%s | has_guidance=%s | has_delta=%s | has_expectation=%s",
        job_id,
        state.get("sentiment") is not None,
        state.get("market_context") is not None,
        state.get("guidance") is not None,
        state.get("delta") is not None,
        state.get("expectation_reality") is not None,
    )

    new_warnings: list[str] = []
    progress = state.get("progress_callback")

    if progress:
        await progress(stage="agents", agent="alpha", status="running", progress_pct=70, message="Generating trading signals...")

    sentiment = state.get("sentiment")
    market_context = state.get("market_context")
    guidance = state.get("guidance")
    delta = state.get("delta")
    expectation = state.get("expectation_reality")
    transcript = state.get("transcript")

    try:
        system, user, provider, model = _agent.load_prompt(
            company_name=transcript.metadata.company_name if transcript else "Unknown",
            ticker=transcript.metadata.company_ticker if transcript else "",
            sentiment_json=json.dumps(sentiment.model_dump(), indent=2) if sentiment else "null",
            market_json=json.dumps(market_context.model_dump(), indent=2) if market_context else "null",
            guidance_json=json.dumps(guidance.model_dump(), indent=2) if guidance else "null",
            expectation_json=json.dumps(expectation.model_dump(), indent=2) if expectation else "null",
            delta_json=json.dumps(delta.model_dump(), indent=2) if delta else "null",
        )

        data = await _agent.call(system, user, provider, model)
        signals = await _agent.parse_output(data)

        new_warnings.extend(_enforce_tier_cap(signals))
        new_warnings.extend(_validate_core_thesis(signals))

        if signals.direction == "Bullish" and not signals.bear_signals:
            new_warnings.append("Alpha: bullish output without counter-signal; forcing Monitor posture.")
            signals.action = "Monitor"

        if progress:
            await progress(stage="agents", agent="alpha", status="complete", progress_pct=80, message=f"Signals generated: {signals.action}")

        elapsed = time.perf_counter() - t0
        logger.info(
            "agent_07_alpha DONE | job_id=%s | duration=%.2fs | direction=%s | action=%s | bull=%d | bear=%d | primary=%d",
            job_id, elapsed, signals.direction, signals.action,
            len(signals.bull_signals), len(signals.bear_signals),
            sum(1 for s in signals.bull_signals + signals.bear_signals if s.priority_tier == "primary"),
        )
        return {"signals": signals, "pipeline_warnings": new_warnings}

    except Exception as e:
        elapsed = time.perf_counter() - t0
        logger.error("agent_07_alpha FAILED | job_id=%s | duration=%.2fs | error=%s", job_id, elapsed, e, exc_info=True)
        new_warnings.append(f"Alpha agent error: {e}")
        if progress:
            await progress(stage="agents", agent="alpha", status="error", progress_pct=80, message=str(e))
        return {"pipeline_warnings": new_warnings}
