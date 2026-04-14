from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ExamCreate(BaseModel):
    title: str
    subject: str
    grade: Optional[str] = None
    description: Optional[str] = None


class ExamUpdate(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    grade: Optional[str] = None
    description: Optional[str] = None


class ExamOut(BaseModel):
    id: int
    teacher_id: int
    title: str
    subject: str
    grade: Optional[str] = None
    description: Optional[str] = None
    rubric_source_filename: Optional[str] = None
    status: str
    question_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RubricExtractionStatus(BaseModel):
    exam_id: int
    status: str
    rubric_source_filename: Optional[str] = None
    questions_count: int = 0
