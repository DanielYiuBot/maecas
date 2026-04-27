import datetime
from sqlalchemy import Column, String, DateTime, Text
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
