from datetime import datetime

from pydantic import BaseModel


class AnswerUpdate(BaseModel):
    answer_text: str


class AnswerOut(BaseModel):
    id: int
    student_id: int
    question_id: int
    answer_text: str
    created_at: datetime

    model_config = {"from_attributes": True}
