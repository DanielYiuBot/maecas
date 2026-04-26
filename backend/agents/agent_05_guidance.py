"""Agent 5 — Guidance & Catalyst Extractor.

Focuses on forward-looking language, guidance ranges, implicit signals,
and upcoming catalysts from the transcript.
"""

import json
import logging
import time

from backend.agents.base import BaseAgent
from backend.schemas.guidance import GuidanceCatalysts
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


class GuidanceAgent(BaseAgent):
    prompt_file = "agent_05_guidance.yaml"
    output_schema = GuidanceCatalysts


_agent = GuidanceAgent()


async def run(state: GraphState) -> dict:
    t0 = time.perf_counter()
    job_id = state.get("job_id", "unknown")
    logger.info(
        "agent_05_guidance START | job_id=%s | has_transcript=%s | has_market_context=%s",
        job_id, state.get("transcript") is not None, state.get("market_context") is not None,
    )

    new_warnings: list[str] = []
    progress = state.get("progress_callback")

    if progress:
        await progress(stage="agents", agent="guidance", status="running", progress_pct=15, message="Extracting forward guidance...")

    transcript = state.get("transcript")
    market_context = state.get("market_context")

    if not transcript:
        new_warnings.append("Guidance: no transcript available")
        logger.warning("agent_05_guidance SKIP | job_id=%s | reason=no transcript", job_id)
        return {"pipeline_warnings": new_warnings}

    try:
        all_utterances = [u.model_dump() for u in transcript.utterances]

        system, user, provider, model = _agent.load_prompt(
            company_name=transcript.metadata.company_name,
            ticker=transcript.metadata.company_ticker,
            event_date=transcript.metadata.event_date,
            utterances_json=json.dumps(all_utterances, indent=2),
            market_context_json=json.dumps(market_context.model_dump(), indent=2) if market_context else "null",
        )

        data = await _agent.call(system, user, provider, model)
        guidance = await _agent.parse_output(data)

        if progress:
            await progress(stage="agents", agent="guidance", status="complete", progress_pct=55, message="Guidance extraction complete.")

        elapsed = time.perf_counter() - t0
        logger.info(
            "agent_05_guidance DONE | job_id=%s | duration=%.2fs | explicit_guidance=%d | catalysts=%d",
            job_id, elapsed, len(guidance.explicit_guidance), len(guidance.catalysts),
        )
        return {"guidance": guidance, "pipeline_warnings": new_warnings}

    except Exception as e:
        elapsed = time.perf_counter() - t0
        logger.error("agent_05_guidance FAILED | job_id=%s | duration=%.2fs | error=%s", job_id, elapsed, e, exc_info=True)
        new_warnings.append(f"Guidance agent error: {e}")
        if progress:
            await progress(stage="agents", agent="guidance", status="error", progress_pct=55, message=str(e))
        return {"pipeline_warnings": new_warnings}
