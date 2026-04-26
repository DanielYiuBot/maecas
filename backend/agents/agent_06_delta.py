"""Agent 6 — QoQ Delta Analyzer.

Only runs when a prior quarter transcript is provided. Compares topic
distributions, sentiment shifts, and guidance specificity between current
and prior quarter transcripts. Also attaches a deterministic language
drift pass (hedging / certainty word frequency) that does not rely on
the LLM so we always have a baseline comparison even when the LLM
output is sparse.
"""

import json
import logging
import re
import time
from typing import Optional

from backend.agents.base import BaseAgent
from backend.schemas.delta import LanguageDrift, QoQDelta
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


class DeltaAgent(BaseAgent):
    prompt_file = "agent_06_delta.yaml"
    output_schema = QoQDelta


_agent = DeltaAgent()

HEDGE_WORDS = (
    "could", "may", "might", "we believe", "we anticipate",
    "subject to", "approximately", "generally", "around",
    "potentially", "uncertain",
)
CERTAINTY_WORDS = (
    "will", "confident", "committed", "definitely", "certain",
    "clearly", "absolutely", "unquestionable", "on track",
)

_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "so", "if", "as", "at",
    "on", "in", "of", "for", "to", "from", "by", "with", "is", "are",
    "was", "were", "be", "been", "being", "it", "its", "this", "that",
    "these", "those", "we", "our", "us", "you", "your", "they", "them",
    "their", "there", "here", "i", "me", "my", "mine", "he", "she",
    "has", "have", "had", "do", "does", "did", "will", "would",
    "should", "could", "may", "might", "can", "just", "not", "no",
    "yes", "than", "then", "now", "also", "very", "really", "about",
}


def _hedge_count(text: str) -> int:
    low = text.lower()
    return sum(low.count(w) for w in HEDGE_WORDS)


def _certainty_count(text: str) -> int:
    low = text.lower()
    return sum(re.findall(rf"\b{re.escape(w)}\b", low).__len__() for w in CERTAINTY_WORDS)


def _per_1k_word_rate(count: int, text: str) -> float:
    tokens = len(text.split())
    if tokens == 0:
        return 0.0
    return (count / tokens) * 1000.0


def _extract_bigrams(text: str) -> set[str]:
    tokens = [t.lower() for t in re.findall(r"[A-Za-z][A-Za-z\-]+", text)]
    filtered = [t for t in tokens if len(t) > 2 and t not in _STOPWORDS]
    return {f"{filtered[i]} {filtered[i + 1]}" for i in range(len(filtered) - 1)}


def _deterministic_language_drift(current_text: str, prior_text: str) -> LanguageDrift:
    c_hedge_rate = _per_1k_word_rate(_hedge_count(current_text), current_text)
    p_hedge_rate = _per_1k_word_rate(_hedge_count(prior_text), prior_text)
    c_cert_rate = _per_1k_word_rate(_certainty_count(current_text), current_text)
    p_cert_rate = _per_1k_word_rate(_certainty_count(prior_text), prior_text)

    c_bigrams = _extract_bigrams(current_text)
    p_bigrams = _extract_bigrams(prior_text)
    added_phrases = sorted(c_bigrams - p_bigrams)[:15]
    removed_phrases = sorted(p_bigrams - c_bigrams)[:15]

    return LanguageDrift(
        added_phrases=added_phrases,
        removed_phrases=removed_phrases,
        hedging_drift=round(c_hedge_rate - p_hedge_rate, 2),
        certainty_drift=round(c_cert_rate - p_cert_rate, 2),
    )


def _merge_language_drift(
    llm_drift: Optional[LanguageDrift],
    deterministic: LanguageDrift,
) -> LanguageDrift:
    """Prefer the LLM's curated phrase lists when they look meaningful; fall back
    to the deterministic bigram diff otherwise. Numeric drifts always come from
    the deterministic pass so they're reproducible."""
    if not llm_drift:
        return deterministic
    added = llm_drift.added_phrases or deterministic.added_phrases
    removed = llm_drift.removed_phrases or deterministic.removed_phrases
    return LanguageDrift(
        added_phrases=added[:15],
        removed_phrases=removed[:15],
        hedging_drift=deterministic.hedging_drift,
        certainty_drift=deterministic.certainty_drift,
    )


async def run(state: GraphState) -> dict:
    t0 = time.perf_counter()
    job_id = state.get("job_id", "unknown")
    logger.info(
        "agent_06_delta START | job_id=%s | has_transcript=%s | has_prior=%s | has_sentiment=%s",
        job_id, state.get("transcript") is not None, state.get("prior_transcript") is not None,
        state.get("sentiment") is not None,
    )

    new_warnings: list[str] = []
    progress = state.get("progress_callback")

    if progress:
        await progress(stage="agents", agent="delta", status="running", progress_pct=55, message="Comparing quarters...")

    transcript = state.get("transcript")
    prior_transcript = state.get("prior_transcript")
    sentiment = state.get("sentiment")

    if not transcript or not prior_transcript:
        new_warnings.append("Delta: missing current or prior transcript")
        logger.info("agent_06_delta SKIP | job_id=%s | reason=missing transcript or prior", job_id)
        if progress:
            await progress(stage="agents", agent="delta", status="skipped", progress_pct=60, message="No prior transcript — delta skipped.")
        return {"pipeline_warnings": new_warnings}

    try:
        current_utterances = [u.model_dump() for u in transcript.utterances]
        prior_utterances = [u.model_dump() for u in prior_transcript.utterances]

        system, user, provider, model = _agent.load_prompt(
            company_name=transcript.metadata.company_name,
            ticker=transcript.metadata.company_ticker,
            current_json=json.dumps(current_utterances, indent=2),
            prior_json=json.dumps(prior_utterances, indent=2),
            sentiment_json=json.dumps(sentiment.model_dump(), indent=2) if sentiment else "null",
        )

        data = await _agent.call(system, user, provider, model)
        delta = await _agent.parse_output(data)

        deterministic = _deterministic_language_drift(
            transcript.presentation_text or "",
            prior_transcript.presentation_text or "",
        )
        delta.language_drift = _merge_language_drift(delta.language_drift, deterministic)

        if progress:
            await progress(stage="agents", agent="delta", status="complete", progress_pct=60, message="Quarter comparison complete.")

        elapsed = time.perf_counter() - t0
        logger.info(
            "agent_06_delta DONE | job_id=%s | duration=%.2fs | topic_deltas=%d | signal_novelty=%d | added_phrases=%d",
            job_id, elapsed, len(delta.topic_deltas), len(delta.signal_novelty),
            len(delta.language_drift.added_phrases) if delta.language_drift else 0,
        )
        return {"delta": delta, "pipeline_warnings": new_warnings}

    except Exception as e:
        elapsed = time.perf_counter() - t0
        logger.error("agent_06_delta FAILED | job_id=%s | duration=%.2fs | error=%s", job_id, elapsed, e, exc_info=True)
        new_warnings.append(f"Delta agent error: {e}")
        if progress:
            await progress(stage="agents", agent="delta", status="error", progress_pct=60, message=str(e))
        return {"pipeline_warnings": new_warnings}
