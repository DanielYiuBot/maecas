from pydantic import BaseModel
from typing import Optional, Literal


class StatedFigure(BaseModel):
    label: str
    value: Optional[float] = None
    unit: str
    period: Optional[str] = None
    source: Literal["Presentation", "QA", "Both"]
    yoy_change: Optional[float] = None
    quote: str


class GuidanceRange(BaseModel):
    metric: str
    low: Optional[float] = None
    high: Optional[float] = None
    qualifier: Literal["confirmed", "conditional", "aspirational"]
    timeline: str = "unspecified"
    quote: str = ""
    unit: str = ""


class StatedFinancials(BaseModel):
    figures: list[StatedFigure]
    qa_only_figures: list[StatedFigure]
    declined_to_quantify: list[str]
    guidance_ranges: list[GuidanceRange]
    confidence: float
    low_confidence_flag: bool
