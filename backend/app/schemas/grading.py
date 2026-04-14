from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class GradingOut(BaseModel):
    id: int
    answer_id: int
    score: float
    matched_criteria_ids: Optional[Any] = None
    rationale: Optional[str] = None
    graded_by: str
    graded_by_user_id: Optional[int] = None
    rubric_version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GradingUpdate(BaseModel):
    score: Optional[float] = None
    matched_criteria_ids: Optional[list] = None
    rationale: Optional[str] = None
