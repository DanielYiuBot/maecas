"""All API route definitions."""

import asyncio
import json
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from backend.api.sse import sse_manager, make_progress_callback, format_sse
from backend.db.database import async_session
from backend.db.models import AnalysisJob, ThesisHistory
from backend.graph.pipeline import build_graph
from backend.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter()

_compiled_graph = None


def _get_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_graph()
    return _compiled_graph


def _classify_thesis_outcome(action: str | None, post_return: float | None) -> tuple[str, str]:
    """Deterministic first-pass track record from the available post-call window."""
    if post_return is None:
        return "unknown", "No post-call price window available yet."
    if action == "Buy":
        if post_return >= 0:
            return "confirmed", f"Buy call followed by {post_return:+.1f}% post-call return."
        if post_return <= -5:
            return "falsified", f"Buy call followed by {post_return:+.1f}% post-call drawdown."
        return "open", f"Buy call return was {post_return:+.1f}%, inside the neutral band."
    if action == "Avoid":
        if post_return <= 0:
            return "confirmed", f"Avoid call followed by {post_return:+.1f}% post-call return."
        if post_return >= 5:
            return "falsified", f"Avoid call followed by {post_return:+.1f}% post-call rally."
        return "open", f"Avoid call return was {post_return:+.1f}%, inside the neutral band."
    return "open", f"Monitor call tracked with {post_return:+.1f}% post-call return."


async def _persist_thesis_history(job_id: str, report) -> None:
    """Insert a ThesisHistory row after a successful analysis so future runs for the
    same ticker can read cross-quarter memory. Silent no-op on any failure because
    this is a non-essential side effect."""
    if not report or not report.signals or not report.signals.core_thesis:
        return
    try:
        ct = report.signals.core_thesis
        ticker = report.metadata.company_ticker if report.metadata else None
        event_date = report.metadata.event_date if report.metadata else None
        if not ticker:
            return

        primary_ids = [
            s.signal_id
            for s in (report.signals.bull_signals + report.signals.bear_signals)
            if s.priority_tier == "primary"
        ]

        mgmt_p = report.sentiment.mgmt_confidence_presentation if report.sentiment else None
        mgmt_q = report.sentiment.mgmt_confidence_qa if report.sentiment else None
        post_return = report.market.price_post_earnings_10d if report.market else None
        outcome, outcome_rationale = _classify_thesis_outcome(ct.decision, post_return)

        async with async_session() as session:
            entry = ThesisHistory(
                job_id=job_id,
                ticker=ticker,
                event_date=event_date,
                one_liner=ct.one_liner,
                decision=ct.decision,
                conviction=ct.conviction,
                primary_signal_ids=json.dumps(primary_ids),
                falsifiers_json=json.dumps(ct.what_would_change_this),
                post_earnings_return_pct=post_return,
                post_earnings_window="10d" if post_return is not None else None,
                thesis_outcome=outcome,
                outcome_rationale=outcome_rationale,
                mgmt_confidence_presentation=mgmt_p,
                mgmt_confidence_qa=mgmt_q,
            )
            session.add(entry)
            await session.commit()
    except Exception as e:
        logger.warning("persist_thesis_history failed | job_id=%s | err=%s", job_id, e)


async def _run_pipeline(job_id: str, current_xml: str, prior_xml: str | None):
    """Execute the full LangGraph pipeline as a background task."""
    import time as _time
    t0 = _time.perf_counter()
    logger.info(
        "Pipeline START | job_id=%s | xml_size=%d | has_prior=%s",
        job_id, len(current_xml), prior_xml is not None,
    )

    progress = make_progress_callback(job_id)
    sse_manager.create_queue(job_id)

    await progress(stage="validation", agent="pipeline", status="running", progress_pct=0, message="Starting pipeline...")

    async with async_session() as session:
        job = await session.get(AnalysisJob, job_id)
        if job:
            job.status = "running"
            job.updated_at = datetime.now(timezone.utc)
            await session.commit()

    try:
        graph = _get_graph()
        initial_state = {
            "raw_xml_current": current_xml,
            "raw_xml_prior": prior_xml,
            "job_id": job_id,
            "progress_callback": progress,
            "transcript": None,
            "prior_transcript": None,
            "sentiment": None,
            "prior_sentiment": None,
            "financials": None,
            "lseg_data": None,
            "market_context": None,
            "guidance": None,
            "delta": None,
            "signals": None,
            "expectation_reality": None,
            "valuation_linkage": None,
            "thesis_memory": None,
            "report": None,
            "pipeline_warnings": [],
        }

        result = await graph.ainvoke(initial_state)

        report = result.get("report")
        warnings = result.get("pipeline_warnings", [])
        async with async_session() as session:
            job = await session.get(AnalysisJob, job_id)
            if job:
                if report:
                    job.status = "complete"
                    job.result_json = report.model_dump_json()
                    if report.metadata:
                        job.ticker = report.metadata.company_ticker
                        job.company_name = report.metadata.company_name
                        job.event_date = report.metadata.event_date
                    if report.signals:
                        job.action = report.signals.action
                else:
                    job.status = "error"
                    job.error_message = "Pipeline completed but no report generated"
                job.updated_at = datetime.now(timezone.utc)
                await session.commit()

        if report:
            await _persist_thesis_history(job_id, report)

        elapsed = _time.perf_counter() - t0
        logger.info(
            "Pipeline DONE | job_id=%s | duration=%.2fs | has_report=%s | warnings=%d",
            job_id, elapsed, report is not None, len(warnings),
        )
        await progress(stage="complete", agent="pipeline", status="complete", progress_pct=100, message="Analysis complete.")

    except Exception as e:
        elapsed = _time.perf_counter() - t0
        logger.error("Pipeline FAILED | job_id=%s | duration=%.2fs | error=%s", job_id, elapsed, e, exc_info=True)
        async with async_session() as session:
            job = await session.get(AnalysisJob, job_id)
            if job:
                job.status = "error"
                job.error_message = str(e)
                job.updated_at = datetime.now(timezone.utc)
                await session.commit()

        await progress(stage="error", agent="pipeline", status="error", progress_pct=100, message=str(e))

    finally:
        await asyncio.sleep(2)
        sse_manager.remove_queue(job_id)


@router.post("/analysis/start")
async def start_analysis(
    background_tasks: BackgroundTasks,
    current_file: UploadFile = File(...),
    prior_file: UploadFile | None = File(None),
):
    if not current_file.filename or not current_file.filename.endswith(".xml"):
        raise HTTPException(status_code=400, detail="Current file must be an .xml file")

    current_xml = (await current_file.read()).decode("utf-8")

    prior_xml = None
    if prior_file:
        if not prior_file.filename or not prior_file.filename.endswith(".xml"):
            raise HTTPException(status_code=400, detail="Prior file must be an .xml file")
        prior_xml = (await prior_file.read()).decode("utf-8")

    size_mb = len(current_xml) / (1024 * 1024)
    if size_mb > settings.max_upload_size_mb:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.max_upload_size_mb}MB limit")

    job_id = str(uuid.uuid4())
    logger.info(
        "start_analysis | job_id=%s | file=%s (%.1f KB) | prior=%s",
        job_id, current_file.filename, len(current_xml) / 1024,
        prior_file.filename if prior_file else None,
    )

    async with async_session() as session:
        job = AnalysisJob(job_id=job_id, status="queued")
        session.add(job)
        await session.commit()

    background_tasks.add_task(_run_pipeline, job_id, current_xml, prior_xml)

    return {"job_id": job_id, "status": "queued"}


@router.get("/analysis/{job_id}/stream")
async def stream_progress(job_id: str):
    async def event_generator():
        queue = sse_manager.subscribe(job_id)

        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield format_sse(event)
                    if event.get("stage") in ("complete", "error"):
                        break
                except asyncio.TimeoutError:
                    yield format_sse({"stage": "heartbeat", "agent": None, "status": "running", "progress_pct": 0, "message": "waiting..."})
        except asyncio.CancelledError:
            pass
        finally:
            sse_manager.unsubscribe(job_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/analysis/{job_id}/result")
async def get_result(job_id: str):
    async with async_session() as session:
        job = await session.get(AnalysisJob, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.status == "queued" or job.status == "running":
            return {"job_id": job_id, "status": job.status, "message": "Analysis still in progress"}
        if job.status == "error":
            return {"job_id": job_id, "status": "error", "message": job.error_message}
        if job.result_json:
            return json.loads(job.result_json)
        raise HTTPException(status_code=500, detail="Result data missing")


@router.get("/analysis/{job_id}/transcript")
async def get_transcript(job_id: str):
    """Return the structured transcript (utterances + metadata) so the frontend can
    support click-a-citation → jump-to-quote. Reads from the persisted
    AnalysisReport payload where utterances are included by the orchestrator."""
    async with async_session() as session:
        job = await session.get(AnalysisJob, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if not job.result_json:
            raise HTTPException(status_code=409, detail="Transcript not available until analysis completes")

        try:
            payload = json.loads(job.result_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="Stored result is not valid JSON")

        utterances = payload.get("transcript_utterances") or []
        return {
            "utterances": utterances,
            "metadata": payload.get("metadata"),
        }


@router.get("/analysis/history")
async def get_history(limit: int = 20, offset: int = 0):
    async with async_session() as session:
        query = (
            select(AnalysisJob)
            .order_by(AnalysisJob.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await session.execute(query)
        jobs = result.scalars().all()
        return [
            {
                "job_id": j.job_id,
                "ticker": j.ticker,
                "company_name": j.company_name,
                "event_date": j.event_date,
                "action": j.action,
                "status": j.status,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in jobs
        ]


@router.delete("/analysis/{job_id}")
async def delete_analysis(job_id: str):
    async with async_session() as session:
        job = await session.get(AnalysisJob, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        await session.delete(job)
        await session.commit()
    return {"deleted": True}


@router.get("/health")
async def health_check():
    from backend.services.lseg import MarketDataService

    lseg_status = "ok" if MarketDataService.is_available() else "error"

    anthropic_status = "ok" if settings.anthropic_api_key else "error"
    gemini_status = "ok" if settings.google_api_key else "error"

    return {
        "api": "ok",
        "lseg": lseg_status,
        "anthropic": anthropic_status,
        "gemini": gemini_status,
    }
