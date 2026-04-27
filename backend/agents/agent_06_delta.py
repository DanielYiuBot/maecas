"""Agent 6 — QoQ Delta Analyzer (multi-prior multi-pass)."""

import asyncio
import json
import logging
import re
import time
from typing import Optional

from backend.agents.base import BaseAgent
from backend.schemas.delta import (
    ComparisonWindow,
    LanguageDrift,
    PairwiseDelta,
    QoQDelta,
    StabilityChecks,
    TopicDelta,
    TopicTrajectory,
    TopicTrajectoryPoint,
    TrendDelta,
)
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


class DeltaPairwiseAgent(BaseAgent):
    prompt_file = "agent_06_delta_pairwise.yaml"
    output_schema = PairwiseDelta


class DeltaTrendAgent(BaseAgent):
    prompt_file = "agent_06_delta_trend.yaml"
    output_schema = dict


_pairwise_agent = DeltaPairwiseAgent()
_trend_agent = DeltaTrendAgent()

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

_VALID_NOVELTY = {"new", "repeated", "de_emphasized", "resolved"}
_RISK_TERMS = (
    "risk", "headwind", "pressure", "constraint", "weakness", "slowdown",
    "regulatory", "china", "competition", "margin", "inventory", "demand",
    "supply", "delay", "uncertain", "litigation", "concentration",
)


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


def _top_phrases(text: str, limit: int = 12) -> list[str]:
    tokens = [t.lower() for t in re.findall(r"[A-Za-z][A-Za-z\-]+", text)]
    filtered = [t for t in tokens if len(t) > 2 and t not in _STOPWORDS]
    counts: dict[str, int] = {}
    for i in range(len(filtered) - 1):
        phrase = f"{filtered[i]} {filtered[i + 1]}"
        counts[phrase] = counts.get(phrase, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [p for p, _ in ranked[:limit]]


def _risk_keyword_diff(current_text: str, prior_text: str) -> list[str]:
    current_low = current_text.lower()
    prior_low = prior_text.lower()
    return [term for term in _RISK_TERMS if term in current_low and term not in prior_low]


def _deterministic_topic_fallback(current_text: str, prior_text: str) -> list[TopicDelta]:
    current = set(_top_phrases(current_text, 20))
    prior = set(_top_phrases(prior_text, 20))
    rows: list[TopicDelta] = []
    for phrase in sorted(current - prior)[:5]:
        rows.append(
            TopicDelta(
                topic=f"Emerging phrase: {phrase}",
                novelty_status="new",
                sentiment_delta=0.0,
                supporting_citations=[],
            )
        )
    for phrase in sorted(prior - current)[:5]:
        rows.append(
            TopicDelta(
                topic=f"Fading phrase: {phrase}",
                novelty_status="de_emphasized",
                sentiment_delta=0.0,
                supporting_citations=[],
            )
        )
    return rows


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


def _phrase_to_topic(phrase: str) -> str:
    cleaned = re.sub(r"\s+", " ", phrase.strip(" .,:;")).strip()
    if not cleaned:
        return ""
    return f"Prior phrase: {cleaned}"


def _ensure_removed_phrase_topics(delta: QoQDelta) -> None:
    """Bridge deterministic phrase drift into topic buckets when the LLM omits drops."""
    drift = delta.language_drift
    if not drift or not drift.removed_phrases:
        return

    dropped_statuses = {"de_emphasized", "resolved"}
    has_dropped_topic = any(
        row.novelty_status.lower() in dropped_statuses
        for row in delta.topic_deltas
    )
    if has_dropped_topic:
        return

    existing_topics = {row.topic.strip().lower() for row in delta.topic_deltas}
    candidates: list[TopicDelta] = []
    for phrase in drift.removed_phrases:
        topic = _phrase_to_topic(phrase)
        if not topic or topic.lower() in existing_topics:
            continue
        existing_topics.add(topic.lower())
        candidates.append(
            TopicDelta(
                topic=topic,
                novelty_status="de_emphasized",
                sentiment_delta=0.0,
                supporting_citations=[],
            )
        )
        if len(candidates) >= 5:
            break

    delta.topic_deltas.extend(candidates)


def _dedupe_topic_deltas(rows: list[TopicDelta]) -> list[TopicDelta]:
    seen = set()
    out = []
    for row in rows:
        key = (row.topic.strip().lower(), row.novelty_status)
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def _normalize_novelty(value: str) -> str:
    normalized = (value or "").strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in _VALID_NOVELTY:
        return normalized
    if normalized in {"old", "ongoing", "unchanged", "same"}:
        return "repeated"
    if normalized in {"dropped", "less_emphasized", "downplayed"}:
        return "de_emphasized"
    return "repeated"


def _sanitize_pairwise(parsed: PairwiseDelta, prior, current_text: str) -> PairwiseDelta:
    prior_text = prior.presentation_text or ""
    parsed.prior_event_date = prior.metadata.event_date
    parsed.confidence = max(0.0, min(1.0, float(parsed.confidence)))
    parsed.guidance_specificity_delta = max(-2, min(2, int(parsed.guidance_specificity_delta)))
    for row in parsed.topic_deltas:
        row.novelty_status = _normalize_novelty(row.novelty_status)
        row.sentiment_delta = max(-1.0, min(1.0, float(row.sentiment_delta)))
        row.supporting_citations = row.supporting_citations[:3]
    for sig in parsed.signal_novelty:
        sig.novelty_status = _normalize_novelty(sig.novelty_status)
    if not parsed.topic_deltas:
        parsed.topic_deltas = _deterministic_topic_fallback(current_text, prior_text)
    deterministic_risks = _risk_keyword_diff(current_text, prior_text)
    parsed.new_risk_keywords = sorted(set((parsed.new_risk_keywords or []) + deterministic_risks))[:20]
    return parsed


def _build_topic_trajectory(pairwise: list[PairwiseDelta]) -> list[TopicTrajectory]:
    by_topic: dict[str, list[TopicTrajectoryPoint]] = {}
    for p in pairwise:
        for t in p.topic_deltas:
            by_topic.setdefault(t.topic, []).append(
                TopicTrajectoryPoint(
                    event_date=p.prior_event_date,
                    novelty_status=t.novelty_status,
                    sentiment_delta=t.sentiment_delta,
                )
            )
    out = [TopicTrajectory(topic=k, points=v) for k, v in by_topic.items()]
    out.sort(key=lambda x: x.topic.lower())
    return out[:25]


def _citation_coverage_ratio(topics: list[TopicDelta]) -> float:
    if not topics:
        return 0.0
    topics_with_citations = sum(1 for t in topics if t.supporting_citations)
    return round(topics_with_citations / len(topics), 3)


async def run(state: GraphState) -> dict:
    t0 = time.perf_counter()
    job_id = state.get("job_id", "unknown")
    logger.info(
        "agent_06_delta START | job_id=%s | has_transcript=%s | prior_count=%d | has_sentiment=%s",
        job_id,
        state.get("transcript") is not None,
        len(state.get("prior_transcripts") or []),
        state.get("sentiment") is not None,
    )

    new_warnings: list[str] = []
    progress = state.get("progress_callback")

    if progress:
        await progress(stage="agents", agent="delta", status="running", progress_pct=55, message="Comparing quarters...")

    transcript = state.get("transcript")
    prior_transcripts = list(state.get("prior_transcripts") or [])
    if not prior_transcripts and state.get("prior_transcript") is not None:
        prior_transcripts = [state.get("prior_transcript")]
    sentiment = state.get("sentiment")

    if not transcript or not prior_transcripts:
        new_warnings.append("Delta: missing current or prior transcript")
        logger.info("agent_06_delta SKIP | job_id=%s | reason=missing transcript or priors", job_id)
        if progress:
            await progress(stage="agents", agent="delta", status="skipped", progress_pct=60, message="No prior transcript — delta skipped.")
        return {"pipeline_warnings": new_warnings}

    try:
        current_utterances = [u.model_dump() for u in transcript.utterances]
        disagreement_flags: list[str] = []
        current_text = transcript.presentation_text or ""

        async def _run_pairwise(prior) -> PairwiseDelta:
            prior_utterances = [u.model_dump() for u in prior.utterances]
            deterministic_payload = {
                "language_drift": _deterministic_language_drift(current_text, prior.presentation_text or "").model_dump(),
                "fallback_topics": [t.model_dump() for t in _deterministic_topic_fallback(current_text, prior.presentation_text or "")],
                "new_risk_keywords": _risk_keyword_diff(current_text, prior.presentation_text or ""),
            }
            system, user, provider, model = _pairwise_agent.load_prompt(
                company_name=transcript.metadata.company_name,
                ticker=transcript.metadata.company_ticker,
                current_event_date=transcript.metadata.event_date,
                prior_event_date=prior.metadata.event_date,
                current_json=json.dumps(current_utterances, indent=2),
                prior_json=json.dumps(prior_utterances, indent=2),
                deterministic_json=json.dumps(deterministic_payload, indent=2),
                sentiment_json=json.dumps(sentiment.model_dump(), indent=2) if sentiment else "null",
            )
            data = await _pairwise_agent.call(system, user, provider, model)
            parsed = await _pairwise_agent.parse_output(data)
            deterministic = _deterministic_language_drift(
                current_text,
                prior.presentation_text or "",
            )
            parsed.language_drift = _merge_language_drift(parsed.language_drift, deterministic)
            parsed = _sanitize_pairwise(parsed, prior, current_text)
            if parsed.confidence < 0.55:
                disagreement_flags.append(
                    f"Low confidence pairwise comparison for prior date {parsed.prior_event_date}."
                )
            return parsed

        pairwise_results = await asyncio.gather(*[
            _run_pairwise(prior) for prior in prior_transcripts[:3]
        ])

        t_system, t_user, t_provider, t_model = _trend_agent.load_prompt(
            company_name=transcript.metadata.company_name,
            ticker=transcript.metadata.company_ticker,
            current_event_date=transcript.metadata.event_date,
            pairwise_json=json.dumps([p.model_dump() for p in pairwise_results], indent=2),
        )
        trend_data = await _trend_agent.call(t_system, t_user, t_provider, t_model)
        trend_deltas = []
        for raw in trend_data.get("trend_deltas", [])[:20]:
            try:
                trend_deltas.append(TrendDelta.model_validate(raw))
            except Exception:
                continue

        merged_topics: list[TopicDelta] = []
        merged_signals = []
        merged_risks = set()
        guide_deltas = []
        for pw in pairwise_results:
            merged_topics.extend(pw.topic_deltas)
            merged_signals.extend(pw.signal_novelty)
            merged_risks.update(pw.new_risk_keywords or [])
            guide_deltas.append(pw.guidance_specificity_delta)
        merged_topics = _dedupe_topic_deltas(merged_topics)
        avg_guidance_delta = round(sum(guide_deltas) / len(guide_deltas)) if guide_deltas else 0
        base_drift = pairwise_results[-1].language_drift if pairwise_results else None
        delta = QoQDelta(
            topic_deltas=merged_topics[:30],
            signal_novelty=merged_signals[:30],
            new_risk_keywords=sorted(merged_risks)[:20],
            guidance_specificity_delta=max(-2, min(2, int(avg_guidance_delta))),
            methodology={
                "metric": "qoq_delta_multi_prior",
                "scale": "qualitative + directional",
                "inputs": ["current transcript", "up to 3 priors", "pairwise deltas", "trend synthesis"],
                "heuristic": "Run pairwise current-vs-prior comparisons for each prior quarter then synthesize durable trends and validate with deterministic language drift.",
            },
            language_drift=base_drift,
            comparison_window=ComparisonWindow(
                current_event_date=transcript.metadata.event_date,
                prior_event_dates=[p.prior_event_date for p in pairwise_results],
            ),
            pairwise_comparisons=pairwise_results,
            trend_deltas=trend_deltas,
            topic_trajectory=_build_topic_trajectory(pairwise_results),
            stability_checks=StabilityChecks(
                citation_coverage_ratio=_citation_coverage_ratio(merged_topics),
                disagreement_flags=disagreement_flags,
                low_confidence_reasons=trend_data.get("low_confidence_reasons", []),
            ),
        )
        _ensure_removed_phrase_topics(delta)

        if progress:
            await progress(stage="agents", agent="delta", status="complete", progress_pct=60, message="Quarter comparison complete.")

        elapsed = time.perf_counter() - t0
        logger.info(
            "agent_06_delta DONE | job_id=%s | duration=%.2fs | pairwise=%d | topic_deltas=%d | signal_novelty=%d | added_phrases=%d",
            job_id, elapsed, len(pairwise_results), len(delta.topic_deltas), len(delta.signal_novelty),
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
