"""Agent 5 — Guidance & Catalyst Extractor.

Focuses on forward-looking language, guidance ranges, implicit signals,
and upcoming catalysts from the transcript.
"""

import json
import logging
import time
from typing import Any

from backend.agents.base import BaseAgent
from backend.agents._citation_sanitize import (
    build_utterance_lookup,
    sanitize_citation_list,
)
from backend.schemas.guidance import GuidanceCatalysts
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


class GuidanceAgent(BaseAgent):
    prompt_file = "agent_05_guidance.yaml"
    output_schema = GuidanceCatalysts


_agent = GuidanceAgent()


def _sanitize_guidance_payload(
    data: dict[str, Any],
    utterances: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[str]]:
    """Walk implicit_signals[].evidence_citations and catalysts[].evidence_citations,
    repair or drop malformed citation dicts, and surface a summary of any drops
    as pipeline warnings."""
    warnings: list[str] = []
    lookup = build_utterance_lookup(utterances)

    total_dropped = 0
    for path, container in (
        ("implicit_signals", data.get("implicit_signals")),
        ("catalysts", data.get("catalysts")),
    ):
        if not isinstance(container, list):
            continue
        for i, entry in enumerate(container):
            if not isinstance(entry, dict):
                continue
            cleaned, dropped = sanitize_citation_list(
                entry.get("evidence_citations"),
                lookup,
                section_hint="QA" if path == "catalysts" else "Presentation",
            )
            entry["evidence_citations"] = cleaned
            total_dropped += dropped
            if dropped > 0:
                warnings.append(
                    f"Guidance: dropped {dropped} unrecoverable citation(s) from {path}[{i}] "
                    "(missing both utterance_index and locatable quote)."
                )

    if total_dropped > 0:
        logger.info(
            "agent_05_guidance | sanitized citations | total_dropped=%d | rebuilt_indexes_via_match=%s",
            total_dropped, "yes" if lookup else "no",
        )
    return data, warnings


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

        # The Gemini guidance pass frequently drops `utterance_index` and `quote`
        # from citation objects (it sometimes returns `{speaker, section, text}`
        # or `{speaker, section}` only). Patch the payload before Pydantic
        # validation so a single LLM compliance miss does not nuke the whole
        # GuidanceCatalysts node and break the dashboard.
        data, sanitize_warnings = _sanitize_guidance_payload(data, all_utterances)
        new_warnings.extend(sanitize_warnings)

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
