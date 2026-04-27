"""Agent 1 — Transcript Parser (no LLM).

Pure Python agent that parses the raw XML into structured TranscriptData.
"""

import logging
import time
from datetime import datetime

from backend.services.xml_parser import parse_transcript
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


async def run(state: GraphState) -> dict:
    """Parse current (and optional prior) transcript XML."""
    t0 = time.perf_counter()
    job_id = state.get("job_id", "unknown")
    priors = list(state.get("raw_xml_priors") or [])
    legacy_prior = state.get("raw_xml_prior")
    if legacy_prior and not priors:
        priors = [legacy_prior]
    has_prior = len(priors) > 0
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

    parsed_priors = []
    for idx, raw_prior in enumerate(priors):
        if not raw_prior:
            continue
        try:
            prior = parse_transcript(raw_prior, is_prior_quarter=True)
            parsed_priors.append(prior)
        except Exception as e:
            logger.warning(
                "agent_01_parser prior parse failed | job_id=%s | prior_idx=%d | error=%s",
                job_id,
                idx,
                e,
            )
            new_warnings.append(f"Parser error (prior[{idx}]): {e}")

    def _safe_event_date_iso(td) -> datetime:
        raw = td.metadata.event_date if td and td.metadata else ""
        try:
            return datetime.fromisoformat((raw or "").replace("Z", "+00:00"))
        except Exception:
            return datetime.min

    parsed_priors.sort(key=_safe_event_date_iso)
    result["prior_transcripts"] = parsed_priors
    if parsed_priors:
        result["prior_transcript"] = parsed_priors[-1]

    result["pipeline_warnings"] = new_warnings

    if progress:
        await progress(stage="agents", agent="parse", status="complete", progress_pct=10, message="Transcript parsed.")

    elapsed = time.perf_counter() - t0
    logger.info(
        "agent_01_parser DONE | job_id=%s | duration=%.2fs | utterances=%d | priors=%d | new_warnings=%d",
        job_id,
        elapsed,
        len(transcript.utterances),
        len(parsed_priors),
        len(new_warnings),
    )
    return result
