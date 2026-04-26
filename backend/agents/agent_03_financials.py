"""Agent 3 — Financial Data Extractor.

Pure extraction of stated figures, guidance ranges, and declined-to-quantify
topics. No comparison or interpretation.
"""

import json
import logging
import time

from backend.agents.base import BaseAgent
from backend.schemas.financials import StatedFinancials
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


class FinancialsAgent(BaseAgent):
    prompt_file = "agent_03_financials.yaml"
    output_schema = StatedFinancials


_agent = FinancialsAgent()


async def run(state: GraphState) -> dict:
    t0 = time.perf_counter()
    job_id = state.get("job_id", "unknown")
    logger.info(
        "agent_03_financials START | job_id=%s | has_transcript=%s",
        job_id, state.get("transcript") is not None,
    )

    new_warnings: list[str] = []
    progress = state.get("progress_callback")

    if progress:
        await progress(stage="agents", agent="financials", status="running", progress_pct=15, message="Extracting financial figures...")

    transcript = state.get("transcript")
    if not transcript:
        new_warnings.append("Financials: no transcript available")
        logger.warning("agent_03_financials SKIP | job_id=%s | reason=no transcript", job_id)
        return {"pipeline_warnings": new_warnings}

    try:
        pres_utterances = [u.model_dump() for u in transcript.utterances if u.section == "Presentation"]
        qa_utterances = [u.model_dump() for u in transcript.utterances if u.section == "QA"]

        system, user, provider, model = _agent.load_prompt(
            company_name=transcript.metadata.company_name,
            ticker=transcript.metadata.company_ticker,
            event_date=transcript.metadata.event_date,
            presentation_json=json.dumps(pres_utterances, indent=2),
            qa_json=json.dumps(qa_utterances, indent=2),
        )

        data = await _agent.call(system, user, provider, model)
        financials = await _agent.parse_output(data)

        if progress:
            await progress(stage="agents", agent="financials", status="complete", progress_pct=30, message="Financial extraction complete.")

        elapsed = time.perf_counter() - t0
        logger.info(
            "agent_03_financials DONE | job_id=%s | duration=%.2fs | figures=%d",
            job_id, elapsed, len(financials.figures),
        )
        return {"financials": financials, "pipeline_warnings": new_warnings}

    except Exception as e:
        elapsed = time.perf_counter() - t0
        logger.error("agent_03_financials FAILED | job_id=%s | duration=%.2fs | error=%s", job_id, elapsed, e, exc_info=True)
        new_warnings.append(f"Financials agent error: {e}")
        if progress:
            await progress(stage="agents", agent="financials", status="error", progress_pct=30, message=str(e))
        return {"pipeline_warnings": new_warnings}
