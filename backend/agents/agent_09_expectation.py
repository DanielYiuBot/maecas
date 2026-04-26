"""Agent 9 — Expectation vs Reality.

Takes the transcript plus pre-earnings news and consensus estimates, and
produces a structured ExpectationReality payload consumed by:
  * Agent 7 (Alpha) to ground priced_in_assessment on each signal.
  * Agent 8 (Orchestrator) when deciding what to surface in what_changed.
  * The frontend CoreThesisHeader / ExpectationRealityPanel.
"""

import json
import logging
import time

from backend.agents.base import BaseAgent
from backend.schemas.expectation import ExpectationReality
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


class ExpectationAgent(BaseAgent):
    prompt_file = "agent_09_expectation.yaml"
    output_schema = ExpectationReality


_agent = ExpectationAgent()


def _slice_pre_call_news(news: list[dict] | None, limit: int = 15) -> list[dict]:
    if not news:
        return []
    return news[:limit]


async def run(state: GraphState) -> dict:
    t0 = time.perf_counter()
    job_id = state.get("job_id", "unknown")
    logger.info(
        "agent_09_expectation START | job_id=%s | has_transcript=%s | has_lseg=%s",
        job_id, state.get("transcript") is not None, state.get("lseg_data") is not None,
    )

    new_warnings: list[str] = []
    progress = state.get("progress_callback")

    if progress:
        await progress(stage="agents", agent="expectation", status="running", progress_pct=60, message="Comparing pre-call expectations to outcome...")

    transcript = state.get("transcript")
    lseg_data = state.get("lseg_data")
    financials = state.get("financials")
    market_context = state.get("market_context")

    if not transcript:
        new_warnings.append("Expectation: no transcript available")
        if progress:
            await progress(stage="agents", agent="expectation", status="skipped", progress_pct=65, message="No transcript — expectation skipped.")
        return {"pipeline_warnings": new_warnings}

    if not lseg_data or not lseg_data.lseg_available:
        new_warnings.append("Expectation: LSEG unavailable — skipping pre-call narrative synthesis")
        logger.info("agent_09_expectation SKIP | job_id=%s | reason=lseg unavailable", job_id)
        if progress:
            await progress(stage="agents", agent="expectation", status="skipped", progress_pct=65, message="LSEG unavailable — expectation skipped.")
        return {"pipeline_warnings": new_warnings}

    try:
        utterances = [u.model_dump() for u in transcript.utterances]
        pre_call_news = _slice_pre_call_news(lseg_data.news_headlines)
        consensus_payload = lseg_data.consensus.model_dump() if lseg_data.consensus else None

        system, user, provider, model = _agent.load_prompt(
            company_name=transcript.metadata.company_name,
            ticker=transcript.metadata.company_ticker,
            event_date=transcript.metadata.event_date,
            utterances_json=json.dumps(utterances, indent=2),
            news_json=json.dumps(pre_call_news, indent=2, default=str),
            consensus_json=json.dumps(consensus_payload, indent=2, default=str),
            financials_json=json.dumps(financials.model_dump(), indent=2) if financials else "null",
            market_json=json.dumps(market_context.model_dump(), indent=2) if market_context else "null",
        )

        data = await _agent.call(system, user, provider, model)
        expectation = await _agent.parse_output(data)

        if progress:
            await progress(stage="agents", agent="expectation", status="complete", progress_pct=68, message="Expectation synthesis complete.")

        elapsed = time.perf_counter() - t0
        logger.info(
            "agent_09_expectation DONE | job_id=%s | duration=%.2fs | delta=%s | what_changed=%d",
            job_id, elapsed, expectation.delta_magnitude, len(expectation.what_changed),
        )
        return {"expectation_reality": expectation, "pipeline_warnings": new_warnings}

    except Exception as e:
        elapsed = time.perf_counter() - t0
        logger.error("agent_09_expectation FAILED | job_id=%s | duration=%.2fs | error=%s", job_id, elapsed, e, exc_info=True)
        new_warnings.append(f"Expectation agent error: {e}")
        if progress:
            await progress(stage="agents", agent="expectation", status="error", progress_pct=65, message=str(e))
        return {"pipeline_warnings": new_warnings}
