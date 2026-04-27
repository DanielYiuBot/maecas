"""Agent 2 — Sentiment Analyzer (multi-pass).

Pass 1: Presentation tone and management register.
Pass 2: Q&A batches for broader analyst-session coverage.
Pass 3: Sentiment synthesis over compact pass outputs.
"""

import json
import logging
import math
import statistics
import time
from typing import Optional

from backend.agents.base import BaseAgent
from backend.schemas.sentiment import (
    AnalystTopicStat,
    EvidenceCitation,
    ManagementAnswerQuality,
    QAExchange,
    ScoreMethodology,
    SentimentBaseline,
    SentimentProfile,
    SentimentStability,
    SpeakerTone,
)
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


class SentimentPresentationAgent(BaseAgent):
    prompt_file = "agent_02_sentiment_presentation.yaml"
    output_schema = dict


class SentimentQABatchAgent(BaseAgent):
    prompt_file = "agent_02_sentiment_qa_batch.yaml"
    output_schema = dict


class SentimentSynthesisAgent(BaseAgent):
    prompt_file = "agent_02_sentiment_synthesis.yaml"
    output_schema = SentimentProfile


_presentation_agent = SentimentPresentationAgent()
_qa_batch_agent = SentimentQABatchAgent()
_synthesis_agent = SentimentSynthesisAgent()


def _chunked(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def _build_qa_exchanges(transcript) -> list[QAExchange]:
    if not transcript:
        return []
    qa_utts = [u for u in transcript.utterances if u.section == "QA"]
    out: list[QAExchange] = []
    i = 0
    while i < len(qa_utts):
        u = qa_utts[i]
        if u.speaker_role != "Analyst":
            i += 1
            continue
        q = u
        answers = []
        j = i + 1
        while j < len(qa_utts) and qa_utts[j].speaker_role != "Analyst":
            answers.append(qa_utts[j])
            j += 1
        if not answers:
            i = j
            continue
        merged_answer = " ".join(a.text for a in answers)
        citations = [
            EvidenceCitation(
                speaker=q.speaker_name,
                section="QA",
                utterance_index=q.index,
                quote=q.text[:220],
            )
        ]
        out.append(
            QAExchange(
                question_utterance_index=q.index,
                answer_utterance_indexes=[a.index for a in answers],
                analyst_question=q.text,
                management_answer=merged_answer,
                topic="",
                analyst_name=q.speaker_name or None,
                follow_up=False,
                citations=citations,
            )
        )
        i = j
    # Flag simple follow-ups by analyst name repetition.
    previous_name = None
    for ex in out:
        ex.follow_up = previous_name is not None and ex.analyst_name == previous_name
        previous_name = ex.analyst_name
    return out


def _safe_score(v, lo=1, hi=10) -> int:
    try:
        n = int(round(float(v)))
    except Exception:
        n = lo
    return max(lo, min(hi, n))


def _compute_topic_map(evasion_scores) -> list[AnalystTopicStat]:
    by_topic: dict[str, list] = {}
    for e in evasion_scores or []:
        t = (e.topic or "unclassified").strip().lower()
        by_topic.setdefault(t, []).append(e)
    rows: list[AnalystTopicStat] = []
    for topic, items in by_topic.items():
        avg_evasion = statistics.mean(float(x.score) for x in items) if items else 0.0
        avg_skepticism = 7.0 if any(x.question_quality == "probing" for x in items) else 5.0
        quality = "weak" if avg_evasion >= 3 else ("mixed" if avg_evasion >= 2 else "strong")
        rows.append(
            AnalystTopicStat(
                topic=topic,
                question_count=len(items),
                avg_skepticism=round(avg_skepticism, 2),
                avg_evasion=round(avg_evasion, 2),
                answer_quality=quality,
            )
        )
    rows.sort(key=lambda x: (-x.question_count, -x.avg_evasion))
    return rows[:8]


def _compute_answer_quality(evasion_scores) -> list[ManagementAnswerQuality]:
    rows: list[ManagementAnswerQuality] = []
    for e in evasion_scores[:10]:
        ev = _safe_score(e.score * 2, 1, 10)
        directness = _safe_score(10 - ev + 1, 1, 10)
        specificity = _safe_score(8 if "specific" in (e.reason or "").lower() else 5, 1, 10)
        numeric_support = _safe_score(8 if any(ch.isdigit() for ch in (e.reason or "")) else 4, 1, 10)
        rows.append(
            ManagementAnswerQuality(
                directness=directness,
                specificity=specificity,
                numeric_support=numeric_support,
                evasion=ev,
                topic=e.topic or "unclassified",
            )
        )
    return rows


def _compute_speaker_tone(transcript, profile: SentimentProfile) -> list[SpeakerTone]:
    if not transcript:
        return []
    by_speaker: dict[str, str] = {}
    for u in transcript.utterances:
        if u.speaker_role in ("CEO", "CFO"):
            by_speaker.setdefault(u.speaker_name, u.speaker_role)
    out: list[SpeakerTone] = []
    for name, role in by_speaker.items():
        is_ceo = role == "CEO"
        out.append(
            SpeakerTone(
                speaker_name=name,
                speaker_role=role,
                confidence=profile.mgmt_confidence_presentation if is_ceo else profile.mgmt_confidence_qa,
                hedging=profile.hedging_frequency,
                register=profile.register,
            )
        )
    return out[:6]


async def _score_transcript(transcript) -> Optional[SentimentProfile]:
    if not transcript:
        return None
    pres_utterances = [u.model_dump() for u in transcript.utterances if u.section == "Presentation"]
    qa_exchanges = _build_qa_exchanges(transcript)

    p_system, p_user, p_provider, p_model = _presentation_agent.load_prompt(
        company_name=transcript.metadata.company_name,
        ticker=transcript.metadata.company_ticker,
        event_date=transcript.metadata.event_date,
        presentation_json=json.dumps(pres_utterances, indent=2),
    )
    p_data = await _presentation_agent.call(p_system, p_user, p_provider, p_model)

    batch_payloads = []
    for chunk in _chunked([x.model_dump() for x in qa_exchanges], 12):
        q_system, q_user, q_provider, q_model = _qa_batch_agent.load_prompt(
            company_name=transcript.metadata.company_name,
            ticker=transcript.metadata.company_ticker,
            event_date=transcript.metadata.event_date,
            qa_batch_json=json.dumps(chunk, indent=2),
        )
        q_data = await _qa_batch_agent.call(q_system, q_user, q_provider, q_model)
        batch_payloads.append(q_data)

    s_system, s_user, s_provider, s_model = _synthesis_agent.load_prompt(
        company_name=transcript.metadata.company_name,
        ticker=transcript.metadata.company_ticker,
        event_date=transcript.metadata.event_date,
        presentation_pass_json=json.dumps(p_data, indent=2),
        qa_passes_json=json.dumps(batch_payloads, indent=2),
        qa_exchanges_json=json.dumps([x.model_dump() for x in qa_exchanges], indent=2),
    )
    s_data = await _synthesis_agent.call(s_system, s_user, s_provider, s_model)
    profile = await _synthesis_agent.parse_output(s_data)

    profile.qa_exchanges = qa_exchanges
    profile.analyst_topic_map = _compute_topic_map(profile.evasion_scores)
    profile.management_answer_quality = _compute_answer_quality(profile.evasion_scores)
    profile.speaker_tone = _compute_speaker_tone(transcript, profile)

    citation_idxs = {c.utterance_index for c in profile.evidence_citations}
    coverage_ratio = min(1.0, len(qa_exchanges) / max(1, len([u for u in transcript.utterances if u.section == "QA"])))
    citation_cov = len(citation_idxs) / max(1, len(transcript.utterances))
    agreement = 1.0 if len(batch_payloads) <= 1 else max(0.0, 1.0 - (0.05 * (len(batch_payloads) - 1)))
    stability_warnings: list[str] = []
    if coverage_ratio < 0.5:
        stability_warnings.append("Low QA exchange coverage in sentiment pass.")
    if citation_cov < 0.03:
        stability_warnings.append("Sparse sentiment evidence citations.")
    profile.sentiment_stability = SentimentStability(
        coverage_ratio=round(coverage_ratio, 3),
        citation_coverage_ratio=round(citation_cov, 3),
        model_agreement_ratio=round(agreement, 3),
        warnings=stability_warnings,
    )

    # Guardrails
    profile.mgmt_confidence_presentation = _safe_score(profile.mgmt_confidence_presentation, 1, 10)
    profile.mgmt_confidence_qa = _safe_score(profile.mgmt_confidence_qa, 1, 10)
    profile.hedging_frequency = _safe_score(profile.hedging_frequency, 1, 10)
    profile.analyst_skepticism = _safe_score(profile.analyst_skepticism, 1, 10)
    profile.confidence = max(0.0, min(1.0, float(profile.confidence)))
    if profile.confidence < 0.6:
        profile.low_confidence_flag = True
    if not profile.score_methodology:
        profile.score_methodology = [
            ScoreMethodology(
                metric="sentiment_multipass",
                scale="1-10 and 0-5",
                inputs=["presentation utterances", "qa exchanges", "qa batch evaluations"],
                heuristic="Multi-pass scoring with deterministic QA segmentation and bounded score clamping.",
            )
        ]
    return profile


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
        "agent_02_sentiment START | job_id=%s | has_transcript=%s | prior_count=%d",
        job_id,
        state.get("transcript") is not None,
        len(state.get("prior_transcripts") or []),
    )

    new_warnings: list[str] = []
    progress = state.get("progress_callback")

    if progress:
        await progress(stage="agents", agent="sentiment", status="running", progress_pct=15, message="Analyzing management tone...")

    transcript = state.get("transcript")
    prior_transcripts = list(state.get("prior_transcripts") or [])
    if not prior_transcripts and state.get("prior_transcript") is not None:
        prior_transcripts = [state.get("prior_transcript")]
    if not transcript:
        new_warnings.append("Sentiment: no transcript available")
        logger.warning("agent_02_sentiment SKIP | job_id=%s | reason=no transcript", job_id)
        return {"pipeline_warnings": new_warnings}

    try:
        sentiment = await _score_transcript(transcript)

        prior_sentiments: list[SentimentProfile] = []
        for idx, prior_t in enumerate(prior_transcripts[:3]):
            try:
                p = await _score_transcript(prior_t)
                if p:
                    prior_sentiments.append(p)
            except Exception as pe:
                logger.warning("agent_02_sentiment prior scoring failed | job_id=%s | idx=%d | err=%s", job_id, idx, pe)
                new_warnings.append(f"Sentiment (prior[{idx}]): {pe}")
        prior_sentiment: Optional[SentimentProfile] = prior_sentiments[-1] if prior_sentiments else None

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
            "prior_sentiments": prior_sentiments,
            "pipeline_warnings": new_warnings,
        }

    except Exception as e:
        elapsed = time.perf_counter() - t0
        logger.error("agent_02_sentiment FAILED | job_id=%s | duration=%.2fs | error=%s", job_id, elapsed, e, exc_info=True)
        new_warnings.append(f"Sentiment agent error: {e}")
        if progress:
            await progress(stage="agents", agent="sentiment", status="error", progress_pct=30, message=str(e))
        return {"pipeline_warnings": new_warnings}
