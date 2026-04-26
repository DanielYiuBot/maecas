"""Agent 4 — Market Context Analyzer.

Two-phase agent:
  fetch_lseg() — non-LLM call to MarketDataService
  run()        — LLM call comparing stated financials vs market data
"""

import json
import logging
import time

from backend.agents.base import BaseAgent
from backend.schemas.market import ComputedMetric, MarketContext, LSEGMarketData
from backend.schemas.sentiment import ScoreMethodology
from backend.services.lseg import MarketDataService
from backend.graph.state import GraphState

logger = logging.getLogger(__name__)


class MarketAgent(BaseAgent):
    prompt_file = "agent_04_market.yaml"
    output_schema = MarketContext


_agent = MarketAgent()
_lseg = MarketDataService()


def _find_figure_value(financials, contains: str) -> float | None:
    if not financials:
        return None
    token = contains.lower()
    for fig in financials.figures + financials.qa_only_figures:
        if token in fig.label.lower() and fig.value is not None:
            return fig.value
    return None


def _compute_metrics(financials) -> list[ComputedMetric]:
    total_rev = _find_figure_value(financials, "revenue")
    networking = _find_figure_value(financials, "network")
    sovereign = _find_figure_value(financials, "sovereign")

    metrics: list[ComputedMetric] = []
    if total_rev and networking is not None:
        metrics.append(
            ComputedMetric(
                metric="networking_share_of_revenue",
                value=(networking / total_rev) * 100,
                unit="percent",
                formula="networking / total_revenue * 100",
                inputs={"networking": networking, "total_revenue": total_rev},
            )
        )
    if total_rev and sovereign is not None:
        metrics.append(
            ComputedMetric(
                metric="sovereign_ai_share_of_revenue",
                value=(sovereign / total_rev) * 100,
                unit="percent",
                formula="sovereign_ai / total_revenue * 100",
                inputs={"sovereign_ai": sovereign, "total_revenue": total_rev},
            )
        )
    return metrics


async def fetch_lseg(state: GraphState) -> dict:
    """Non-LLM node: fetch data from LSEG Market Data Service."""
    t0 = time.perf_counter()
    job_id = state.get("job_id", "unknown")
    logger.info(
        "agent_04_market.fetch_lseg START | job_id=%s | has_transcript=%s | has_sentiment=%s",
        job_id, state.get("transcript") is not None, state.get("sentiment") is not None,
    )

    new_warnings: list[str] = []
    progress = state.get("progress_callback")

    if progress:
        await progress(stage="lseg", agent="lseg_fetch", status="running", progress_pct=35, message="Fetching LSEG market data...")

    transcript = state.get("transcript")
    sentiment = state.get("sentiment")

    macro_flags = sentiment.macro_flags if sentiment else []

    ric = transcript.metadata.ric if transcript else None
    ticker = transcript.metadata.company_ticker if transcript else None
    company_name = transcript.metadata.company_name if transcript else None
    earnings_date = transcript.metadata.event_date if transcript else ""

    try:
        lseg_data = _lseg.fetch_all(
            ric=ric,
            ticker=ticker,
            company_name=company_name,
            earnings_date=earnings_date,
            macro_flags=macro_flags,
        )

        if transcript and lseg_data.resolved_ric:
            transcript.metadata.resolved_ric = lseg_data.resolved_ric

    except Exception as e:
        logger.error("agent_04_market.fetch_lseg FAILED | job_id=%s | error=%s", job_id, e)
        new_warnings.append(f"LSEG fetch error: {e}")
        lseg_data = LSEGMarketData(
            resolved_ric=None,
            price_history=[],
            fundamentals={},
            consensus=None,
            news_headlines=[],
            macro={},
            lseg_available=False,
            estimates_surprise_fy0=None,
            instrument_display=None,
            lseg_blocks=None,
            estimate_revisions=None,
        )

    if progress:
        status = "complete" if lseg_data.lseg_available else "skipped"
        msg = "LSEG data fetched." if lseg_data.lseg_available else "LSEG unavailable — proceeding without market data."
        await progress(stage="lseg", agent="lseg_fetch", status=status, progress_pct=40, message=msg)

    elapsed = time.perf_counter() - t0
    logger.info(
        "agent_04_market.fetch_lseg DONE | job_id=%s | duration=%.2fs | lseg_available=%s | new_warnings=%d",
        job_id, elapsed, lseg_data.lseg_available, len(new_warnings),
    )
    return {"lseg_data": lseg_data, "transcript": transcript, "pipeline_warnings": new_warnings}


async def run(state: GraphState) -> dict:
    """LLM node: compare stated financials against LSEG market data."""
    t0 = time.perf_counter()
    job_id = state.get("job_id", "unknown")
    logger.info(
        "agent_04_market.run START | job_id=%s | has_financials=%s | has_lseg=%s",
        job_id, state.get("financials") is not None, state.get("lseg_data") is not None,
    )

    new_warnings: list[str] = []
    progress = state.get("progress_callback")

    if progress:
        await progress(stage="agents", agent="market_ctx", status="running", progress_pct=45, message="Analyzing market context...")

    financials = state.get("financials")
    lseg_data = state.get("lseg_data")
    transcript = state.get("transcript")

    if not financials and not lseg_data:
        market_ctx = MarketContext(
            beat_miss_flags=[],
            price_pre_earnings_30d=None,
            price_post_earnings_10d=None,
            analyst_rec_summary=None,
            computed_metrics=[],
            balance_risks=[],
            lseg_available=False,
            confidence=0.0,
            low_confidence_flag=True,
            confidence_rationale="Insufficient inputs: both extracted financials and LSEG payload missing.",
            methodology=ScoreMethodology(
                metric="market_context_confidence",
                scale="0-1",
                inputs=["financials", "lseg_data"],
                heuristic="Fallback confidence set to zero when both required inputs are missing.",
            ),
        )
        new_warnings.append("Market context: no financials or LSEG data")
        logger.warning("agent_04_market.run SKIP | job_id=%s | reason=no financials or LSEG data", job_id)
        return {"market_context": market_ctx, "pipeline_warnings": new_warnings}

    try:
        system, user, provider, model = _agent.load_prompt(
            company_name=transcript.metadata.company_name if transcript else "Unknown",
            ticker=transcript.metadata.company_ticker if transcript else "",
            financials_json=json.dumps(
                financials.model_dump(), indent=2, default=str
            )
            if financials
            else "{}",
            lseg_json=json.dumps(
                lseg_data.model_dump(), indent=2, default=str
            )
            if lseg_data
            else '{"lseg_available": false}',
        )

        data = await _agent.call(system, user, provider, model)
        market_ctx = await _agent.parse_output(data)
        market_ctx.computed_metrics = _compute_metrics(financials)

        if progress:
            await progress(stage="agents", agent="market_ctx", status="complete", progress_pct=55, message="Market context analysis complete.")

        elapsed = time.perf_counter() - t0
        logger.info(
            "agent_04_market.run DONE | job_id=%s | duration=%.2fs | confidence=%.2f",
            job_id, elapsed, market_ctx.confidence,
        )
        return {"market_context": market_ctx, "pipeline_warnings": new_warnings}

    except Exception as e:
        elapsed = time.perf_counter() - t0
        logger.error("agent_04_market.run FAILED | job_id=%s | duration=%.2fs | error=%s", job_id, elapsed, e, exc_info=True)
        new_warnings.append(f"Market context agent error: {e}")
        market_ctx = MarketContext(
            beat_miss_flags=[],
            price_pre_earnings_30d=None,
            price_post_earnings_10d=None,
            analyst_rec_summary=None,
            computed_metrics=[],
            balance_risks=["analysis_unavailable"],
            lseg_available=lseg_data.lseg_available if lseg_data else False,
            confidence=0.0,
            low_confidence_flag=True,
            confidence_rationale=f"Market context generation failed: {e}",
            methodology=ScoreMethodology(
                metric="market_context_confidence",
                scale="0-1",
                inputs=["financials", "lseg_data"],
                heuristic="Set to zero when market context generation raises an exception.",
            ),
        )
        if progress:
            await progress(stage="agents", agent="market_ctx", status="error", progress_pct=55, message=str(e))
        return {"market_context": market_ctx, "pipeline_warnings": new_warnings}
