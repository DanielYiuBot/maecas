"""Agent 1 — Transcript Parser (no LLM).

Pure Python agent that parses the raw XML into structured TranscriptData.
"""

import logging
import time

from backend.services.xml_parser import parse_transcript
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


async def run(state: GraphState) -> dict:
    """Parse current (and optional prior) transcript XML."""
    t0 = time.perf_counter()
    job_id = state.get("job_id", "unknown")
    has_prior = state.get("raw_xml_prior") is not None
    xml_len = len(state.get("raw_xml_current") or "")
    logger.info(
        "agent_01_parser START | job_id=%s | xml_len=%d | has_prior=%s",
        job_id, xml_len, has_prior,
    )

    new_warnings: list[str] = []
    progress = state.get("progress_callback")

    if progress:
        await progress(stage="agents", agent="parse", status="running", progress_pct=5, message="Parsing transcript XML...")

    try:
        transcript = parse_transcript(state["raw_xml_current"], is_prior_quarter=False)
    except Exception as e:
        logger.error("agent_01_parser FAILED (current) | job_id=%s | error=%s", job_id, e)
        new_warnings.append(f"Parser error (current): {e}")
        if progress:
            await progress(stage="agents", agent="parse", status="error", progress_pct=5, message=str(e))
        return {"pipeline_warnings": new_warnings}

    result: dict = {
        "transcript": transcript,
        "pipeline_warnings": [],
    }

    raw_prior = state.get("raw_xml_prior")
    if raw_prior:
        try:
            prior = parse_transcript(raw_prior, is_prior_quarter=True)
            result["prior_transcript"] = prior
        except Exception as e:
            logger.warning("agent_01_parser prior parse failed | job_id=%s | error=%s", job_id, e)
            new_warnings.append(f"Parser error (prior): {e}")

    result["pipeline_warnings"] = new_warnings

    if progress:
        await progress(stage="agents", agent="parse", status="complete", progress_pct=10, message="Transcript parsed.")

    elapsed = time.perf_counter() - t0
    logger.info(
        "agent_01_parser DONE | job_id=%s | duration=%.2fs | utterances=%d | has_prior=%s | new_warnings=%d",
        job_id, elapsed, len(transcript.utterances), "prior_transcript" in result, len(new_warnings),
    )
    return result
