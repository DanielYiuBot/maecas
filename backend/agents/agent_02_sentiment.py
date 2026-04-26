"""Agent 2 — Sentiment Analyzer.

Analyzes management tone, hedging, analyst skepticism, and evasion
from the transcript utterances. When a prior-quarter transcript is
provided we also score that transcript (quietly) so the main report can
anchor current scores against the prior-quarter baseline.
"""

import json
import logging
import time
from typing import Optional

from backend.agents.base import BaseAgent
from backend.schemas.sentiment import SentimentBaseline, SentimentProfile
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


class SentimentAgent(BaseAgent):
    prompt_file = "agent_02_sentiment.yaml"
    output_schema = SentimentProfile


_agent = SentimentAgent()


async def _score_transcript(transcript) -> Optional[SentimentProfile]:
    if not transcript:
        return None
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
    return await _agent.parse_output(data)


def _interpret(current: float, prior: Optional[float]) -> str:
    if prior is None:
        return "in_line"
    diff = current - prior
    if diff >= 1.0:
        return "above_avg"
    if diff <= -1.0:
        return "below_avg"
    return "in_line"


def _attach_baselines(current: SentimentProfile, prior: Optional[SentimentProfile]) -> None:
    """Mutates `current` to add baseline objects derived from `prior`."""
    prior_pres = prior.mgmt_confidence_presentation if prior else None
    prior_qa = prior.mgmt_confidence_qa if prior else None

    current.mgmt_confidence_presentation_baseline = SentimentBaseline(
        current=float(current.mgmt_confidence_presentation),
        prior_quarter=float(prior_pres) if prior_pres is not None else None,
        speaker_2y_avg=None,
        interpretation=_interpret(
            float(current.mgmt_confidence_presentation),
            float(prior_pres) if prior_pres is not None else None,
        ),
    )
    current.mgmt_confidence_qa_baseline = SentimentBaseline(
        current=float(current.mgmt_confidence_qa),
        prior_quarter=float(prior_qa) if prior_qa is not None else None,
        speaker_2y_avg=None,
        interpretation=_interpret(
            float(current.mgmt_confidence_qa),
            float(prior_qa) if prior_qa is not None else None,
        ),
    )


async def run(state: GraphState) -> dict:
    t0 = time.perf_counter()
    job_id = state.get("job_id", "unknown")
    logger.info(
        "agent_02_sentiment START | job_id=%s | has_transcript=%s | has_prior=%s",
        job_id, state.get("transcript") is not None, state.get("prior_transcript") is not None,
    )

    new_warnings: list[str] = []
    progress = state.get("progress_callback")

    if progress:
        await progress(stage="agents", agent="sentiment", status="running", progress_pct=15, message="Analyzing management tone...")

    transcript = state.get("transcript")
    prior_transcript = state.get("prior_transcript")
    if not transcript:
        new_warnings.append("Sentiment: no transcript available")
        logger.warning("agent_02_sentiment SKIP | job_id=%s | reason=no transcript", job_id)
        return {"pipeline_warnings": new_warnings}

    try:
        sentiment = await _score_transcript(transcript)

        prior_sentiment: Optional[SentimentProfile] = None
        if prior_transcript:
            try:
                prior_sentiment = await _score_transcript(prior_transcript)
            except Exception as pe:
                logger.warning("agent_02_sentiment prior scoring failed | job_id=%s | err=%s", job_id, pe)
                new_warnings.append(f"Sentiment (prior): {pe}")

        if sentiment is not None:
            _attach_baselines(sentiment, prior_sentiment)

        if progress:
            await progress(stage="agents", agent="sentiment", status="complete", progress_pct=30, message="Sentiment analysis complete.")

        elapsed = time.perf_counter() - t0
        logger.info(
            "agent_02_sentiment DONE | job_id=%s | duration=%.2fs | confidence=%.2f | prior_scored=%s",
            job_id, elapsed, sentiment.confidence if sentiment else 0.0, prior_sentiment is not None,
        )
        return {
            "sentiment": sentiment,
            "prior_sentiment": prior_sentiment,
            "pipeline_warnings": new_warnings,
        }

    except Exception as e:
        elapsed = time.perf_counter() - t0
        logger.error("agent_02_sentiment FAILED | job_id=%s | duration=%.2fs | error=%s", job_id, elapsed, e, exc_info=True)
        new_warnings.append(f"Sentiment agent error: {e}")
        if progress:
            await progress(stage="agents", agent="sentiment", status="error", progress_pct=30, message=str(e))
        return {"pipeline_warnings": new_warnings}
