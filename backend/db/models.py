import datetime
from sqlalchemy import Column, String, DateTime, Text, Integer, Float, Index
from backend.db.database import Base


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    job_id = Column(String, primary_key=True, index=True)
    status = Column(String, default="queued")
    ticker = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    event_date = Column(String, nullable=True)
    action = Column(String, nullable=True)
    result_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class ThesisHistory(Base):
    """Cross-quarter thesis memory. One row per analysis that produced a core_thesis."""

    __tablename__ = "thesis_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String, index=True, nullable=False)
    ticker = Column(String, index=True, nullable=False)
    event_date = Column(String, nullable=True)
    one_liner = Column(Text, nullable=True)
    decision = Column(String, nullable=True)
    conviction = Column(String, nullable=True)
    primary_signal_ids = Column(Text, nullable=True)
    falsifiers_json = Column(Text, nullable=True)
    post_earnings_return_pct = Column(Float, nullable=True)
    post_earnings_window = Column(String, nullable=True)
    thesis_outcome = Column(String, nullable=True)
    outcome_rationale = Column(Text, nullable=True)
    mgmt_confidence_presentation = Column(Integer, nullable=True)
    mgmt_confidence_qa = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


Index("ix_thesis_history_ticker_event", ThesisHistory.ticker, ThesisHistory.event_date)
