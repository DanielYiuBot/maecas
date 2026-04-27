import operator
from typing import Annotated, TypedDict, Optional

from backend.schemas.transcript import TranscriptData
from backend.schemas.sentiment import SentimentProfile
from backend.schemas.financials import StatedFinancials
from backend.schemas.market import LSEGMarketData, MarketContext
from backend.schemas.guidance import GuidanceCatalysts
from backend.schemas.delta import QoQDelta
from backend.schemas.signals import TradingSignals
from backend.schemas.report import AnalysisReport
from backend.schemas.expectation import ExpectationReality, ValuationLinkage


class GraphState(TypedDict):
    raw_xml_current: str
    raw_xml_prior: Optional[str]
    raw_xml_priors: list[str]
    job_id: str
    progress_callback: object

    transcript: Optional[TranscriptData]
    prior_transcript: Optional[TranscriptData]
    prior_transcripts: list[TranscriptData]
    sentiment: Optional[SentimentProfile]
    prior_sentiment: Optional[SentimentProfile]
    prior_sentiments: list[SentimentProfile]
    financials: Optional[StatedFinancials]
    lseg_data: Optional[LSEGMarketData]
    market_context: Optional[MarketContext]
    guidance: Optional[GuidanceCatalysts]
    delta: Optional[QoQDelta]
    signals: Optional[TradingSignals]
    expectation_reality: Optional[ExpectationReality]
    valuation_linkage: Optional[ValuationLinkage]
    report: Optional[AnalysisReport]
    pipeline_warnings: Annotated[list[str], operator.add]
