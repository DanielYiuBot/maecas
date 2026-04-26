from pydantic import BaseModel
from typing import Literal, Optional


class Utterance(BaseModel):
    index: int
    speaker_name: str
    speaker_role: Literal["CEO", "CFO", "Analyst", "Operator", "Unknown"]
    section: Literal["Presentation", "QA"]
    text: str


class TranscriptMetadata(BaseModel):
    event_id: str
    company_name: str
    company_ticker: str
    ric: Optional[str] = None
    cusip: Optional[str] = None
    isin: Optional[str] = None
    event_type_id: str
    event_date: str
    last_update: str
    expiration_date: str
    same_year_check: bool
    resolved_ric: Optional[str] = None


class TranscriptData(BaseModel):
    metadata: TranscriptMetadata
    utterances: list[Utterance]
    presentation_text: str
    qa_text: str
    is_prior_quarter: bool = False
