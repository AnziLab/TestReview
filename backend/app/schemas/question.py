from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class QuestionCreate(BaseModel):
    number: str
    order_index: int = 0
    question_text: Optional[str] = None
    max_score: float = 0
    model_answer: Optional[str] = None
    rubric_json: Optional[dict] = None


class QuestionUpdate(BaseModel):
    number: Optional[str] = None
    order_index: Optional[int] = None
    question_text: Optional[str] = None
    max_score: Optional[float] = None
    model_answer: Optional[str] = None
    rubric_json: Optional[dict] = None


class QuestionOut(BaseModel):
    id: int
    exam_id: int
    number: str
    order_index: int
    question_text: Optional[str] = None
    max_score: float
    model_answer: Optional[str] = None
    rubric_json: Any
    rubric_draft_json: Optional[Any] = None
    rubric_version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RubricDraftSave(BaseModel):
    rubric_draft_json: dict
