from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


# ─── Settings ────────────────────────────────────────────────────────────────

class SettingsUpdate(BaseModel):
    llm_provider: str
    llm_api_key: str
    llm_model: str
    ocr_provider: Optional[str] = None
    ocr_model: Optional[str] = None
    clova_api_url: Optional[str] = None
    clova_secret_key: Optional[str] = None


class SettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    llm_provider: str
    llm_api_key_masked: Optional[str] = None
    llm_model: Optional[str]
    ocr_provider: Optional[str] = None
    ocr_model: Optional[str] = None
    clova_api_url: Optional[str] = None
    clova_secret_key_masked: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ─── Exam ─────────────────────────────────────────────────────────────────────

class ExamCreate(BaseModel):
    name: str


class ExamResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime
    updated_at: datetime


# ─── Answer Sheet ─────────────────────────────────────────────────────────────

class AnswerSheetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    exam_id: str
    image_path: str
    page_number: int
    created_at: datetime


# ─── Region ───────────────────────────────────────────────────────────────────

class RegionCreate(BaseModel):
    question_number: str
    x: float
    y: float
    width: float
    height: float
    model_answer: Optional[str] = None
    rubric: Optional[str] = None
    max_score: float = 10.0


class RegionUpdate(BaseModel):
    question_number: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    model_answer: Optional[str] = None
    rubric: Optional[str] = None
    max_score: Optional[float] = None


class RegionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    answer_sheet_id: str
    question_number: str
    x: float
    y: float
    width: float
    height: float
    model_answer: Optional[str]
    rubric: Optional[str]
    max_score: float
    created_at: datetime


class RegionsBulkCreate(BaseModel):
    regions: List[RegionCreate]


# ─── Student Page ──────────────────────────────────────────────────────────────

class StudentPageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    student_id: str
    page_number: int
    image_path: str
    created_at: datetime


# ─── Student ──────────────────────────────────────────────────────────────────

class StudentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    exam_id: str
    name: str
    student_number: str
    scan_image_path: Optional[str]
    pages: List[StudentPageResponse] = []
    created_at: datetime


# ─── Student Answer ───────────────────────────────────────────────────────────

class StudentAnswerUpdate(BaseModel):
    score: Optional[float] = None
    grading_status: Optional[str] = None
    grading_feedback: Optional[str] = None
    is_ambiguous: Optional[bool] = None
    ambiguity_reason: Optional[str] = None
    review_round: Optional[int] = None


class StudentAnswerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    student_id: str
    region_id: str
    ocr_text: Optional[str]
    ocr_confidence: Optional[float]
    score: Optional[float]
    is_ambiguous: bool
    ambiguity_reason: Optional[str]
    grading_status: str
    grading_feedback: Optional[str]
    review_round: int
    created_at: datetime
    updated_at: datetime


class StudentDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    exam_id: str
    name: str
    student_number: str
    scan_image_path: Optional[str]
    pages: List[StudentPageResponse] = []
    created_at: datetime
    answers: List[StudentAnswerResponse] = []


# ─── Grading ──────────────────────────────────────────────────────────────────

class GradingRegionSummary(BaseModel):
    region_id: str
    question_number: str
    total_students: int
    graded_count: int
    ambiguous_count: int
    avg_score: Optional[float]
    max_score: float


class GradingSummaryResponse(BaseModel):
    exam_id: str
    total_students: int
    questions: List[GradingRegionSummary]


class AmbiguousAnswerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    student_id: str
    region_id: str
    student_name: str
    student_number: str
    question_number: str
    ocr_text: Optional[str]
    score: Optional[float]
    ambiguity_reason: Optional[str]
    grading_feedback: Optional[str]
    grading_status: str


class CheckGradingResponse(BaseModel):
    region_id: str
    question_number: str
    total_processed: int
    ambiguous_count: int
    results: List[dict]


class DetectedRegion(BaseModel):
    x: float
    y: float
    width: float
    height: float
