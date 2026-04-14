from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class RefinementSessionOut(BaseModel):
    id: int
    question_id: int
    rubric_snapshot_json: Any
    status: str
    error: Optional[str] = None
    cluster_count: int = 0
    unjudgable_count: int = 0
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AnswerClusterOut(BaseModel):
    id: int
    session_id: int
    label: str
    representative_text: str
    size: int
    judgable: bool
    suggested_score: Optional[float] = None
    reason: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ClusterMemberOut(BaseModel):
    id: int
    cluster_id: int
    answer_id: int
    answer_text: str

    model_config = {"from_attributes": True}
