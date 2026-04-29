from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class ClassCreate(BaseModel):
    name: str
    scan_mode: str = "single"


class ClassOut(BaseModel):
    id: int
    exam_id: int
    name: str
    scan_mode: str
    source_pdf_filename: Optional[str] = None
    ocr_status: str
    ocr_error: Optional[str] = None
    student_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}




class OcrStatusOut(BaseModel):
    id: int
    ocr_status: str
    ocr_error: Optional[str] = None
    students_count: int = 0
    students_processed: int = 0
    total_estimated: Optional[int] = None


class StudentUpdate(BaseModel):
    student_number: Optional[str] = None
    name: Optional[str] = None
    needs_review: Optional[bool] = None


class StudentOut(BaseModel):
    id: int
    class_id: int
    student_number: Optional[str] = None
    name: Optional[str] = None
    page_indices: Any
    ocr_confidence: Optional[str] = None
    needs_review: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
