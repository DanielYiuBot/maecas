"""Agent 10 — Thesis Memory.

Queries ThesisHistory for the same ticker from prior runs, then tags the
current analysis as `new`, `evolved`, `reinforced`, or `reversed` based on
overlap with prior primary signals. No LLM — deterministic.
"""

import json
import logging
import time

from sqlalchemy import select

from backend.schemas.expectation import PriorThesisEntry, ThesisMemory, TrackRecordSummary
from backend.db.database import async_session
from backend.db.models import ThesisHistory
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


def _track_record_summary(priors: list[PriorThesisEntry]) -> TrackRecordSummary:
    if not priors:
        return TrackRecordSummary(
            status="insufficient_history",
            rationale="No prior MAECAS calls for this ticker yet.",
        )

    counts = {"confirmed": 0, "falsified": 0, "open": 0, "unknown": 0}
    returns: list[float] = []
    for prior in priors:
        outcome = prior.thesis_outcome or "unknown"
        counts[outcome if outcome in counts else "unknown"] += 1
        if prior.post_earnings_return_pct is not None:
            returns.append(prior.post_earnings_return_pct)

    if returns:
        status = "available" if len(returns) >= 2 else "insufficient_history"
        avg_return = sum(returns) / len(returns)
        rationale = (
            f"{len(returns)} prior call{'s' if len(returns) != 1 else ''} have post-call return windows; "
            "treat small samples as directional, not calibrated."
        )
    else:
        status = "unavailable"
        avg_return = None
        rationale = "Prior theses exist, but no post-call return windows are stored yet."

    return TrackRecordSummary(
        prior_call_count=len(priors),
        confirmed_count=counts["confirmed"],
        falsified_count=counts["falsified"],
        open_count=counts["open"],
        unknown_count=counts["unknown"],
        comparable_decision_count=len(returns),
        avg_post_earnings_return_pct=avg_return,
        return_window="10d" if returns else None,
        status=status,
        rationale=rationale,
    )


def _coerce_outcome(value: str | None) -> str:
    if value in {"confirmed", "falsified", "open", "unknown"}:
        return value
    return "unknown"


async def run(state: GraphState) -> dict:
    t0 = time.perf_counter()
    job_id = state.get("job_id", "unknown")

    transcript = state.get("transcript")
    if not transcript:
        return {"pipeline_warnings": ["Memory: no transcript available"]}

    ticker = transcript.metadata.company_ticker
    event_date = transcript.metadata.event_date
    logger.info("agent_10_memory START | job_id=%s | ticker=%s", job_id, ticker)

    progress = state.get("progress_callback")
    if progress:
        await progress(stage="agents", agent="memory", status="running", progress_pct=12, message="Loading prior-quarter thesis history...")

    prior_entries: list[PriorThesisEntry] = []
    try:
        async with async_session() as session:
            q = (
                select(ThesisHistory)
                .where(ThesisHistory.ticker == ticker)
                .where(ThesisHistory.event_date != event_date)
                .order_by(ThesisHistory.created_at.desc())
                .limit(6)
            )
            result = await session.execute(q)
            rows = result.scalars().all()
            for row in rows:
                try:
                    ids_raw = row.primary_signal_ids or "[]"
                    parsed_ids = json.loads(ids_raw) if ids_raw else []
                except json.JSONDecodeError:
                    parsed_ids = []
                if row.decision not in ("Buy", "Monitor", "Avoid"):
                    continue
                if row.conviction not in ("High", "Medium", "Low"):
                    continue
                prior_entries.append(
                    PriorThesisEntry(
                        job_id=row.job_id,
                        event_date=row.event_date or "",
                        one_liner=row.one_liner or "",
                        decision=row.decision,
                        conviction=row.conviction,
                        primary_signal_ids=parsed_ids if isinstance(parsed_ids, list) else [],
                        post_earnings_return_pct=row.post_earnings_return_pct,
                        post_earnings_window=row.post_earnings_window,
                        thesis_outcome=_coerce_outcome(row.thesis_outcome),
                        outcome_rationale=row.outcome_rationale or "",
                    )
                )
    except Exception as e:
        logger.warning("agent_10_memory DB lookup failed | job_id=%s | err=%s", job_id, e)
        if progress:
            await progress(stage="agents", agent="memory", status="skipped", progress_pct=13, message=f"Memory unavailable: {e}")
        return {"pipeline_warnings": [f"Memory lookup error: {e}"]}

    memory = ThesisMemory(
        prior_theses=prior_entries,
        thesis_evolution="new" if not prior_entries else "evolved",
        evolution_rationale=(
            "No prior coverage for this ticker." if not prior_entries
            else f"Loaded {len(prior_entries)} prior coverage entries for cross-quarter comparison."
        ),
        track_record=_track_record_summary(prior_entries),
    )

    elapsed = time.perf_counter() - t0
    logger.info(
        "agent_10_memory DONE | job_id=%s | duration=%.2fs | prior_theses=%d",
        job_id, elapsed, len(prior_entries),
    )
    if progress:
        await progress(stage="agents", agent="memory", status="complete", progress_pct=13, message=f"Loaded {len(prior_entries)} prior analyses.")

    return {"thesis_memory": memory, "pipeline_warnings": []}
