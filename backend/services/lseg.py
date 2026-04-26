"""Market Data Service — centralizes all LSEG Data Library calls.

No agent imports lseg.data directly. All methods catch exceptions and
return None / [] on failure so the pipeline never aborts due to LSEG issues.
"""

import logging
import math
from datetime import datetime, timedelta
from typing import Any, Optional

from backend.schemas.market import (
    LSEGMarketData,
    PricePoint,
    ConsensusEstimates,
    EstimatesSurpriseFY0,
    EstimateRevisions,
    EstimateRevisionSnapshot,
    MetricSurpriseSnapshot,
    InstrumentDisplay,
)

logger = logging.getLogger(__name__)

try:
    import lseg.data as ld
    LSEG_AVAILABLE = True
except ImportError:
    ld = None  # type: ignore
    LSEG_AVAILABLE = False
    logger.warning("lseg-data package not installed — MarketDataService will return empty data")


def _offset_date(date_str: str, days: int) -> str:
    """Offset an ISO date string by business days (approximate)."""
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except ValueError:
        try:
            dt = datetime.strptime(date_str, "%d-%b-%y %I:%M%p %Z")
        except ValueError:
            dt = datetime.now()
    cal_days = int(days * 7 / 5) if abs(days) > 5 else days
    result = dt + timedelta(days=cal_days)
    return result.strftime("%Y-%m-%d")


def _parse_event_dt(date_str: str) -> datetime:
    """Best-effort parse for transcript event timestamps."""
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except ValueError:
        try:
            return datetime.strptime(date_str, "%d-%b-%y %I:%M%p %Z")
        except ValueError:
            return datetime.now()


def _sanitize_for_json(obj: Any) -> Any:
    """Recursively convert LSEG/pandas values so ``json.dumps`` and Pydantic payloads stay safe."""
    if obj is None:
        return None
    if isinstance(obj, dict):
        return {str(k): _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_for_json(v) for v in obj]
    if isinstance(obj, (str, int, bool)):
        return obj
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, datetime):
        return obj.isoformat()
    try:
        import numpy as np

        if isinstance(obj, np.generic):
            return _sanitize_for_json(obj.item())
    except ImportError:
        pass
    try:
        import pandas as pd

        if isinstance(obj, pd.Timestamp):
            if pd.isna(obj):
                return None
            return obj.isoformat()
    except ImportError:
        pass
    # pandas Timestamp can subclass datetime in some versions
    if type(obj).__name__ == "Timestamp" and hasattr(obj, "isoformat"):
        try:
            return obj.isoformat()
        except Exception:
            pass
    return str(obj)


def _coerce_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        x = float(val)
        if math.isnan(x) or math.isinf(x):
            return None
        return x
    except (TypeError, ValueError):
        return None


def _coerce_int(val: Any) -> Optional[int]:
    if val is None:
        return None
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return None


def _is_row_index_dict(cell: dict) -> bool:
    """True if LSEG encoded rows as string keys "0", "1", ... (DataFrame index in to_dict)."""
    if not cell:
        return False
    for k in cell:
        s = str(k).lstrip("-")
        if not s.isdigit():
            return False
    return True


def _get_data_cell(data: dict, instrument: str, *column_prefixes: str):
    """Read one instrument value from ld.get_data(...).to_dict() output.

    Column names may be plain ``TR.Foo`` or parameterized ``TR.Foo(Period=FY1)``.
    Inner dict is usually ``{RIC: value}`` for a single row, ``{RIC: v}`` only,
    or **row-indexed** ``{"0": v0, "1": v1, ...}`` when the frame has multiple
    years/rows (common for fundamentals and some consensus layouts).
    """
    for col, cell in data.items():
        if not isinstance(cell, dict):
            continue
        if not any(str(col).startswith(p) for p in column_prefixes):
            continue
        if instrument in cell:
            return cell[instrument]
        if len(cell) == 1:
            return next(iter(cell.values()))
        if _is_row_index_dict(cell):
            # Multiple rows: use the last index (typical time order = most recent FY)
            order = sorted(cell.keys(), key=lambda k: int(str(k).lstrip("-")))
            return cell[order[-1]]
    return None


class MarketDataService:
    """All LSEG Data Library calls are centralized here.

    Supports two session types (configured via LSEG_SESSION_TYPE env var):
      - "platform": connects to LSEG cloud directly via API credentials
                     (no desktop application required)
      - "desktop":  connects through locally running LSEG Workspace app
    """

    _session_open = False

    @staticmethod
    def open():
        if not LSEG_AVAILABLE:
            logger.warning("LSEG library not available — skipping session open")
            return

        from backend.settings import settings

        session_type = settings.lseg_session_type.lower()

        try:
            session_name = "platform.ldp" if session_type == "platform" else "desktop.workspace"
            ld.open_session(name=session_name)

            label = "Platform (cloud)" if session_type == "platform" else "Desktop (Workspace)"
            logger.info("LSEG %s session opened", label)
            MarketDataService._session_open = True
        except Exception as e:
            logger.error("Failed to open LSEG session (type=%s): %s", session_type, e)
            MarketDataService._session_open = False

    @staticmethod
    def close():
        if not LSEG_AVAILABLE or not MarketDataService._session_open:
            return
        try:
            ld.close_session()
            MarketDataService._session_open = False
        except Exception as e:
            logger.error("Failed to close LSEG session: %s", e)

    @staticmethod
    def is_available() -> bool:
        return LSEG_AVAILABLE and MarketDataService._session_open

    def _discovery_pick_ric(self, query: str, equity_only: bool) -> Optional[str]:
        if not query or not self.is_available():
            return None
        try:
            kwargs: dict = {"query": query, "select": "RIC", "top": 3}
            if equity_only:
                kwargs["filter"] = "AssetClass eq 'equity'"
            results = ld.discovery.search(**kwargs)
            if results is not None and len(results) > 0:
                return str(results.iloc[0]["RIC"])
        except Exception as e:
            logger.warning("resolve_identifier: discovery.search(%r, equity_only=%s): %s", query, equity_only, e)
        return None

    def _try_get_data_ric(self, candidate: str) -> Optional[str]:
        try:
            df = ld.get_data(candidate, ["TR.RIC"])
            if df is not None and not df.empty:
                return candidate
        except Exception as e:
            logger.debug("resolve_identifier: get_data(%s): %s", candidate, e)
        return None

    def resolve_identifier(
        self,
        ric: Optional[str] = None,
        ticker: Optional[str] = None,
        name: Optional[str] = None,
    ) -> Optional[str]:
        """RIC -> ticker -> name fallback. Returns confirmed RIC or None."""
        ric = ric.strip() if ric else None
        ticker = ticker.strip().upper() if ticker else None
        name = name.strip() if name else None

        logger.info("resolve_identifier called: ric=%s, ticker=%s, name=%s", ric, ticker, name)

        if not self.is_available():
            logger.warning("resolve_identifier: LSEG not available")
            return None

        if ric:
            if self._try_get_data_ric(ric):
                logger.info("resolve_identifier: using RIC from XML: %s", ric)
                return ric
            if "." not in ric and "=" not in ric and ric.isalnum():
                for suffix in (".N", ".O", ".L"):
                    cand = f"{ric}{suffix}"
                    if self._try_get_data_ric(cand):
                        logger.info("resolve_identifier: qualified bare symbol %s -> %s", ric, cand)
                        return cand

        if ticker:
            t_candidates = [ticker]
            if ticker.isalnum():
                t_candidates.extend(f"{ticker}{s}" for s in (".N", ".O", ".L"))
            for q in t_candidates:
                resolved = self._try_get_data_ric(q)
                if resolved:
                    logger.info("resolve_identifier: ticker %s resolved via get_data as %s", ticker, resolved)
                    return resolved
            for equity_only in (True, False):
                resolved = self._discovery_pick_ric(ticker, equity_only)
                if resolved:
                    logger.info("resolve_identifier: discovery resolved ticker %s -> %s", ticker, resolved)
                    return resolved
                for q in t_candidates[1:]:
                    resolved = self._discovery_pick_ric(q, equity_only)
                    if resolved:
                        logger.info("resolve_identifier: discovery resolved %s -> %s", q, resolved)
                        return resolved

        if name:
            for equity_only in (True, False):
                resolved = self._discovery_pick_ric(name, equity_only)
                if resolved:
                    logger.info("resolve_identifier: name '%s' -> %s", name, resolved)
                    return resolved

        logger.warning("resolve_identifier: all lookups failed — returning None")
        return None

    def get_price_window(self, ric: str, earnings_date: str) -> list[dict]:
        """Daily OHLCV from -30 to +10 business days around earnings_date."""
        if not self.is_available():
            return []
        try:
            df = ld.get_history(
                universe=ric,
                fields=["OPEN_PRC", "HIGH_1", "LOW_1", "TRDPRC_1", "ACVOL_UNS"],
                interval="daily",
                start=_offset_date(earnings_date, -30),
                end=_offset_date(earnings_date, 10),
            )
            return df.reset_index().to_dict(orient="records")
        except Exception as e:
            logger.warning("get_price_window failed for %s: %s", ric, e)
            return []

    def get_fundamentals(self, ric: str, earnings_date: str) -> dict:
        """Annual fundamentals (recent years).

        Some LSEG access points reject **parenthesized** TR formulas in ``fields`` (unexpected
        ``'('`` in formula). We therefore prefer **plain TR names** plus ``parameters`` for
        fiscal period / frequency. Bare ``Period: \"FY\"`` is invalid; use ``FY0`` etc.
        """
        if not self.is_available():
            return {}
        event_dt = _parse_event_dt(earnings_date)
        start_year = event_dt.year - 5
        end_year = event_dt.year

        # (1) Multi-year annual series centered around transcript event year.
        try:
            df = ld.get_data(
                universe=ric,
                fields=[
                    "TR.Revenue",
                    "TR.GrossProfit",
                    "TR.GrossProfitMargin",
                    "TR.EBITDA",
                    "TR.NetIncome",
                ],
                parameters={
                    "SDate": f"{start_year}-01-01",
                    "EDate": f"{end_year}-12-31",
                    "Frq": "FY",
                },
            )
            return _sanitize_for_json(df.to_dict())
        except Exception as e:
            logger.warning("get_fundamentals (calendar FY series) failed for %s: %s", ric, e)

        # (2) Single-year snapshot: Period=FY0 + Frq=FY (field names without parentheses).
        merged: dict = {}
        try:
            df0 = ld.get_data(
                universe=ric,
                fields=[
                    "TR.RevenueActValue",
                    "TR.GrossProfit",
                    "TR.GrossProfitMargin",
                    "TR.EBITDA",
                    "TR.NetIncome",
                ],
                parameters={"Period": "FY0", "Frq": "FY"},
            )
            merged.update(df0.to_dict())
        except Exception as e:
            logger.warning("get_fundamentals (FY0 snapshot) failed for %s: %s", ric, e)
        for period in ("FY-1", "FY-2"):
            try:
                df_p = ld.get_data(
                    universe=ric,
                    fields=["TR.RevenueActValue"],
                    parameters={"Period": period, "Frq": "FY"},
                )
                for col, cell in df_p.to_dict().items():
                    merged[f"{col}@{period}"] = cell
            except Exception as e:
                logger.debug("get_fundamentals optional %s revenue slice failed for %s: %s", period, ric, e)
        try:
            df_e = ld.get_data(
                universe=ric,
                fields=["TR.EPSSmartEst"],
                parameters={"Period": "FY1", "Frq": "FY"},
            )
            merged.update(df_e.to_dict())
        except Exception as e:
            logger.debug("get_fundamentals EPSSmartEst FY1 failed for %s: %s", ric, e)

        if not merged:
            try:
                df_inline = ld.get_data(
                    universe=ric,
                    fields=[
                        "TR.EPSActValue(Period=FY0)",
                        "TR.EPSMeanEstimate(Period=FY1)",
                        "TR.RevenueActValue(Period=FY0)",
                        "TR.RevenueMeanEstimate(Period=FY1)",
                    ],
                )
                merged = df_inline.to_dict()
            except Exception as e:
                logger.debug("get_fundamentals inline FY0/FY1 fallback failed for %s: %s", ric, e)

        return _sanitize_for_json(merged) if merged else {}

    def get_consensus(self, ric: str, earnings_date: str) -> dict:
        """IBES-style mean estimates (FY1) and analyst recommendation counts."""
        if not self.is_available():
            return {}
        field_sets = [
            [
                "TR.EPSMeanEstimate",
                "TR.RevenueMeanEstimate",
                "TR.EBITDAMean",
                "TR.NoOfBuyRec",
                "TR.NoOfHoldRec",
                "TR.NoOfSellRec",
            ],
            [
                "TR.EPSMeanEstimate",
                "TR.RevenueMean",
                "TR.EBITDAMean",
                "TR.NoOfBuyRec",
                "TR.NoOfHoldRec",
                "TR.NoOfSellRec",
            ],
        ]
        event_dt = _parse_event_dt(earnings_date)
        # Priority: period matching the earnings event first.
        event_month = event_dt.month
        likely_quarter = "FQ1" if event_month in (1, 2, 3) else "FQ0"
        param_variants: list[Optional[dict[str, str]]] = [
            {"Period": "FY0", "Frq": "FY"},
            {"Period": likely_quarter, "Frq": "FQ"},
            {"Period": "FY1", "Frq": "FY"},
            {"Period": "FQ0", "Frq": "FQ"},
            {"Period": "FQ1", "Frq": "FQ"},
            {"Frq": "FY"},
            None,
        ]
        best: dict = {}
        best_non_null = -1

        def _count_non_null(d: dict) -> int:
            cnt = 0
            for cell in d.values():
                if not isinstance(cell, dict):
                    continue
                for v in cell.values():
                    if v is not None:
                        cnt += 1
            return cnt

        for fields in field_sets:
            for params in param_variants:
                try:
                    df = ld.get_data(universe=ric, fields=fields, parameters=params) if params else ld.get_data(universe=ric, fields=fields)
                    d = _sanitize_for_json(df.to_dict())
                    non_null = _count_non_null(d)
                    if non_null > best_non_null:
                        best = d
                        best_non_null = non_null
                    if non_null >= 3:
                        return d
                except Exception as e:
                    logger.debug(
                        "get_consensus failed for %s | fields=%s | params=%s | err=%s",
                        ric, fields, params, e,
                    )
        if best:
            logger.info(
                "get_consensus returning sparse payload for %s | non_null_cells=%d | keys=%s",
                ric, best_non_null, list(best.keys())[:8],
            )
        return best

    def _surprise_metric_from_row(self, raw: dict, ric: str, prefix: str) -> Optional[MetricSurpriseSnapshot]:
        if prefix == "EPS":
            actual_cols = ("TR.EPSActValue", "Earnings Per Share - Actual")
            mean_cols = ("TR.EPSMeanEstimate", "Earnings Per Share - Mean Estimate")
            surprise_cols = ("TR.EPSActSurprise", "Earnings Per Share - Actual Surprise")
            sue_cols = ("TR.EPSActSueScore", "Earnings Per Share - Standard Unexpected Earnings")
            est_count_cols = ("TR.EPSNumofEstimates", "Earnings Per Share - Number of Estimates")
        else:
            actual_cols = ("TR.RevenueActValue", "Revenue - Actual")
            mean_cols = ("TR.RevenueMeanEstimate", "TR.RevenueMean", "Revenue - Mean Estimate")
            surprise_cols = ("TR.RevenueActSurprise", "Revenue - Actual Surprise")
            sue_cols = ("TR.RevenueActSueScore", "Revenue - Standard Unexpected Earnings")
            est_count_cols = ("TR.RevenueNumofEstimates", "Revenue - Number of Estimates")

        rd = _get_data_cell(raw, ric, f"TR.{prefix}ActReportDate", "Report Date")
        act_report_date = None if rd is None else str(_sanitize_for_json(rd))
        snap = MetricSurpriseSnapshot(
            actual=_coerce_float(_get_data_cell(raw, ric, *actual_cols)),
            act_report_date=act_report_date,
            mean_estimate=_coerce_float(_get_data_cell(raw, ric, *mean_cols)),
            surprise_pct=_coerce_float(_get_data_cell(raw, ric, *surprise_cols)),
            sue_score=_coerce_float(_get_data_cell(raw, ric, *sue_cols)),
            num_estimates=_coerce_int(_get_data_cell(raw, ric, *est_count_cols)),
        )
        if not any(
            getattr(snap, a) is not None
            for a in (
                "actual",
                "mean_estimate",
                "surprise_pct",
                "sue_score",
                "num_estimates",
                "act_report_date",
            )
        ):
            return None
        return snap

    def get_estimates_surprise_fy0(self, ric: str, earnings_date: str) -> Optional[EstimatesSurpriseFY0]:
        """Actual vs mean, surprise %, SUE, count — Estimates_Surprise.ipynb FY0 annual pattern."""
        if not self.is_available():
            return None
        eps_fields = [
            "TR.EPSActValue",
            "TR.EPSActReportDate",
            "TR.EPSMeanEstimate",
            "TR.EPSActSurprise",
            "TR.EPSActSueScore",
            "TR.EPSNumofEstimates",
        ]
        rev_fields = [
            "TR.RevenueActValue",
            "TR.RevenueActReportDate",
            "TR.RevenueMeanEstimate",
            "TR.RevenueActSurprise",
            "TR.RevenueActSueScore",
            "TR.RevenueNumofEstimates",
        ]
        event_dt = _parse_event_dt(earnings_date)

        param_variants: list[Optional[dict[str, str]]] = [
            {"Period": "FY0", "SDate": "FY0", "EDate": "FY-4", "Frq": "FY"},
            {"Period": "FY0", "Sdate": "FY0", "Edate": "FY-4", "FRQ": "FY"},
            {"Period": "FY0", "Frq": "FY"},
            {"Period": "FQ0", "Frq": "FQ"},
            {"Period": "FQ1", "Frq": "FQ"},
            {"Frq": "FY"},
            None,
        ]
        # Two separate get_data calls: a single request with EPS+Revenue fields can
        # return duplicate column names from the library, which breaks to_dict().
        best: Optional[EstimatesSurpriseFY0] = None
        best_score: tuple[int, float] = (-1, float("-inf"))

        def _metric_populated_count(m: Optional[MetricSurpriseSnapshot]) -> int:
            if m is None:
                return 0
            return sum(
                1
                for a in ("actual", "mean_estimate", "surprise_pct", "sue_score", "num_estimates")
                if getattr(m, a) is not None
            )

        def _closest_to_event_score(s: EstimatesSurpriseFY0) -> float:
            # Higher is better; prefer dates closest to event date.
            best = float("-inf")
            for m in (s.eps, s.revenue):
                if m is None or not m.act_report_date:
                    continue
                try:
                    ts = datetime.fromisoformat(m.act_report_date.replace("Z", "+00:00")).timestamp()
                    delta_days = abs((datetime.fromtimestamp(ts, tz=event_dt.tzinfo) - event_dt).total_seconds()) / 86400.0
                    score = -delta_days
                    if score > best:
                        best = score
                except Exception:
                    continue
            return best

        for params in param_variants:
            try:
                merged_try: dict = {}
                for fields in (eps_fields, rev_fields):
                    df = ld.get_data(universe=ric, fields=fields, parameters=params) if params else ld.get_data(universe=ric, fields=fields)
                    merged_try.update(df.to_dict())

                eps_snap = self._surprise_metric_from_row(merged_try, ric, "EPS")
                rev_snap = self._surprise_metric_from_row(merged_try, ric, "Revenue")
                if eps_snap is None and rev_snap is None:
                    continue
                cand = EstimatesSurpriseFY0(eps=eps_snap, revenue=rev_snap)
                score = (
                    _metric_populated_count(cand.eps) + _metric_populated_count(cand.revenue),
                    _closest_to_event_score(cand),
                )
                if score > best_score:
                    best = cand
                    best_score = score
            except Exception as e:
                logger.debug(
                    "get_estimates_surprise_fy0 split (params=%s) failed for %s: %s", params, ric, e
                )
        return best

    def get_estimate_revisions(self, ric: str, earnings_date: str) -> dict:
        """Historical FY1 consensus means at T-30/T-60/T-90 vs today.

        Best-effort: uses ``TR.EPSMeanEstimate`` / ``TR.RevenueMeanEstimate`` with an
        ``Edate`` parameter and falls back to the inline form when the library rejects
        the parameterised form. The caller should treat missing windows as "unavailable"
        rather than zero.
        """
        if not self.is_available():
            return {}

        event_dt = _parse_event_dt(earnings_date)
        windows = {
            "latest": None,
            "30d_ago": 30,
            "60d_ago": 60,
            "90d_ago": 90,
        }

        out: dict[str, dict[str, Optional[float]]] = {}
        for label, days_ago in windows.items():
            edate = None if days_ago is None else (event_dt - timedelta(days=days_ago)).strftime("%Y-%m-%d")
            params_variants = [
                {"Period": "FY1", "Frq": "FY"},
                {"Period": "FY1", "Frq": "FY", "Edate": edate} if edate else None,
            ]
            snap: dict[str, Optional[float]] = {"eps_mean": None, "revenue_mean": None}
            for params in params_variants:
                if params is None:
                    continue
                try:
                    df = ld.get_data(
                        universe=ric,
                        fields=["TR.EPSMeanEstimate", "TR.RevenueMeanEstimate"],
                        parameters=params,
                    )
                    d = _sanitize_for_json(df.to_dict())
                    eps_val = _coerce_float(_get_data_cell(d, ric, "TR.EPSMeanEstimate"))
                    rev_val = _coerce_float(_get_data_cell(d, ric, "TR.RevenueMeanEstimate"))
                    if eps_val is not None:
                        snap["eps_mean"] = eps_val
                    if rev_val is not None:
                        snap["revenue_mean"] = rev_val
                    if eps_val is not None or rev_val is not None:
                        break
                except Exception as e:
                    logger.debug("get_estimate_revisions %s failed for %s: %s", label, ric, e)
            out[label] = snap

        return out

    def get_instrument_display(self, ric: str) -> Optional[InstrumentDisplay]:
        """Company / exchange labels for sanity-check after RIC resolution (tear-sheet style)."""
        if not self.is_available():
            return None
        try:
            df = ld.get_data(ric, ["TR.CompanyName", "TR.ExchangeName"])
            d = df.to_dict()
            cn = _get_data_cell(d, ric, "TR.CompanyName", "Company Name")
            ex = _get_data_cell(d, ric, "TR.ExchangeName", "Exchange Name")
            if cn is None and ex is None:
                return None
            return InstrumentDisplay(
                company_name=str(cn) if cn is not None else None,
                exchange_name=str(ex) if ex is not None else None,
            )
        except Exception as e:
            logger.debug("get_instrument_display failed for %s: %s", ric, e)
            return None

    def get_news(self, ric: str, start: str, end: str) -> list[dict]:
        """Headlines around the event via Access-layer news API (LSEG codebook pattern).

        ``get_data`` with ``TR.HeadlineText`` / ``TR.NewsDateTime`` often fails; the
        reference notebooks use ``news.get_headlines`` with a query string instead.
        """
        if not self.is_available():
            return []
        news_mod = getattr(ld, "news", None)
        if news_mod is None or not hasattr(news_mod, "get_headlines"):
            logger.warning("get_news: lseg.data.news.get_headlines not available")
            return []
        try:
            query = f"R:{ric} AND Language:LEN AND Source:RTRS"
            df = news_mod.get_headlines(query, start=str(start), end=str(end), count=100)
            if df is None or getattr(df, "empty", True):
                df = news_mod.get_headlines(
                    f"R:{ric} AND Language:LEN", start=str(start), end=str(end), count=100
                )
            if df is None or getattr(df, "empty", True):
                return []
            if hasattr(df, "reset_index"):
                df = df.reset_index()
            records = df.to_dict(orient="records")
            return _sanitize_for_json(records)
        except Exception as e:
            logger.warning("get_news (get_headlines) failed for %s: %s", ric, e)
            return []

    MACRO_RIC_MAP = {
        "FX": ["EUR=", "GBP=", "JPY="],
        "consumer_sentiment": ["USCONC=ECI"],
        "inflation": ["USCPIY=ECI"],
        "interest_rates": ["US10YT=RR"],
        "tariffs": ["DXY="],
        "box_office": [".SPXCT"],
    }

    def get_macro(self, macro_flags: list[str]) -> dict:
        result: dict = {}
        if not self.is_available():
            return result
        for flag in macro_flags:
            rics = self.MACRO_RIC_MAP.get(flag, [])
            for ric in rics:
                try:
                    df = ld.get_data(ric, ["BID", "ASK", "CF_LAST"])
                    result[ric] = _sanitize_for_json(df.to_dict())
                except Exception:
                    result[ric] = None
        return result

    def fetch_all(
        self,
        ric: Optional[str],
        ticker: Optional[str],
        company_name: Optional[str],
        earnings_date: str,
        macro_flags: list[str],
    ) -> LSEGMarketData:
        """Orchestrate all LSEG calls and return a single LSEGMarketData."""
        resolved = self.resolve_identifier(ric=ric, ticker=ticker, name=company_name)

        if not resolved or not self.is_available():
            return LSEGMarketData(
                resolved_ric=resolved,
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

        price_raw = self.get_price_window(resolved, earnings_date)
        price_history = []
        for p in price_raw:
            try:
                price_history.append(
                    PricePoint(
                        date=str(p.get("Date", p.get("date", ""))),
                        open=float(p.get("OPEN_PRC", 0)),
                        high=float(p.get("HIGH_1", 0)),
                        low=float(p.get("LOW_1", 0)),
                        close=float(p.get("TRDPRC_1", 0)),
                        volume=p.get("ACVOL_UNS"),
                    )
                )
            except (ValueError, TypeError):
                continue

        fundamentals = self.get_fundamentals(resolved, earnings_date)
        consensus_raw = self.get_consensus(resolved, earnings_date)
        instrument_display = self.get_instrument_display(resolved)
        estimates_surprise_fy0 = self.get_estimates_surprise_fy0(resolved, earnings_date)

        consensus = None
        if consensus_raw:
            try:
                c_try = ConsensusEstimates(
                    eps_mean=_get_data_cell(
                        consensus_raw,
                        resolved,
                        "TR.EPSMeanEstimate",
                        "Earnings Per Share - Mean Estimate",
                    ),
                    revenue_mean=_get_data_cell(
                        consensus_raw,
                        resolved,
                        "TR.RevenueMeanEstimate",
                        "TR.RevenueMean",
                        "Revenue - Mean Estimate",
                    ),
                    ebitda_mean=_get_data_cell(
                        consensus_raw,
                        resolved,
                        "TR.EBITDAMean",
                        "EBITDA - Mean",
                    ),
                    analyst_buy_count=_coerce_int(
                        _get_data_cell(consensus_raw, resolved, "TR.NoOfBuyRec", "Number of Buy Recommendations")
                    ),
                    analyst_hold_count=_coerce_int(
                        _get_data_cell(consensus_raw, resolved, "TR.NoOfHoldRec", "Number of Hold Recommendations")
                    ),
                    analyst_sell_count=_coerce_int(
                        _get_data_cell(consensus_raw, resolved, "TR.NoOfSellRec", "Number of Sell Recommendations")
                    ),
                )
                has_any = any(
                    v is not None
                    for v in (
                        c_try.eps_mean,
                        c_try.revenue_mean,
                        c_try.ebitda_mean,
                        c_try.analyst_buy_count,
                        c_try.analyst_hold_count,
                        c_try.analyst_sell_count,
                    )
                )
                consensus = c_try if has_any else None
                if consensus is None:
                    logger.info(
                        "consensus parsed empty for %s | keys=%s",
                        resolved,
                        list(consensus_raw.keys())[:12],
                    )
            except Exception:
                consensus = None

        news = self.get_news(
            resolved,
            _offset_date(earnings_date, -7),
            _offset_date(earnings_date, 7),
        )
        macro = self.get_macro(macro_flags)

        def _surprise_ok(s: Optional[EstimatesSurpriseFY0]) -> bool:
            if s is None:
                return False
            for m in (s.eps, s.revenue):
                if m is None:
                    continue
                if any(
                    getattr(m, a) is not None
                    for a in (
                        "actual",
                        "mean_estimate",
                        "surprise_pct",
                        "sue_score",
                        "num_estimates",
                        "act_report_date",
                    )
                ):
                    return True
            return False

        revisions_raw = self.get_estimate_revisions(resolved, earnings_date)
        estimate_revisions = None
        if revisions_raw:
            def _snap(d: Optional[dict]) -> Optional[EstimateRevisionSnapshot]:
                if not d:
                    return None
                if d.get("eps_mean") is None and d.get("revenue_mean") is None:
                    return None
                return EstimateRevisionSnapshot(
                    eps_mean=d.get("eps_mean"),
                    revenue_mean=d.get("revenue_mean"),
                )

            estimate_revisions = EstimateRevisions(
                latest=_snap(revisions_raw.get("latest")),
                window_30d_ago=_snap(revisions_raw.get("30d_ago")),
                window_60d_ago=_snap(revisions_raw.get("60d_ago")),
                window_90d_ago=_snap(revisions_raw.get("90d_ago")),
            )
            if all(
                getattr(estimate_revisions, f) is None
                for f in ("latest", "window_30d_ago", "window_60d_ago", "window_90d_ago")
            ):
                estimate_revisions = None

        lseg_blocks = {
            "price": len(price_history) > 0,
            "fundamentals": bool(fundamentals),
            "consensus": consensus is not None,
            "news": len(news) > 0,
            "macro": any(v is not None for v in macro.values()) if macro else False,
            "estimates_surprise_fy0": _surprise_ok(estimates_surprise_fy0),
            "instrument_display": instrument_display is not None
            and (
                (instrument_display.company_name is not None)
                or (instrument_display.exchange_name is not None)
            ),
            "estimate_revisions": estimate_revisions is not None,
        }

        return LSEGMarketData(
            resolved_ric=resolved,
            price_history=price_history,
            fundamentals=fundamentals,
            consensus=consensus,
            news_headlines=news,
            macro=macro,
            lseg_available=True,
            estimates_surprise_fy0=estimates_surprise_fy0,
            instrument_display=instrument_display,
            lseg_blocks=lseg_blocks,
            estimate_revisions=estimate_revisions,
        )
