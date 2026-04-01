import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class Exam(Base):
    __tablename__ = "exams"

    id = Column(String, primary_key=True, default=_new_uuid)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    answer_sheets = relationship("AnswerSheet", back_populates="exam", cascade="all, delete-orphan")
    students = relationship("Student", back_populates="exam", cascade="all, delete-orphan")


class AnswerSheet(Base):
    __tablename__ = "answer_sheets"

    id = Column(String, primary_key=True, default=_new_uuid)
    exam_id = Column(String, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    image_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=_now)

    exam = relationship("Exam", back_populates="answer_sheets")
    regions = relationship("Region", back_populates="answer_sheet", cascade="all, delete-orphan")


class Region(Base):
    __tablename__ = "regions"

    id = Column(String, primary_key=True, default=_new_uuid)
    answer_sheet_id = Column(String, ForeignKey("answer_sheets.id", ondelete="CASCADE"), nullable=False)
    question_number = Column(String, nullable=False)
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    width = Column(Float, nullable=False)
    height = Column(Float, nullable=False)
    model_answer = Column(Text, nullable=True)
    rubric = Column(Text, nullable=True)
    max_score = Column(Float, default=10.0)
    created_at = Column(DateTime, default=_now)

    answer_sheet = relationship("AnswerSheet", back_populates="regions")
    student_answers = relationship("StudentAnswer", back_populates="region", cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = "students"

    id = Column(String, primary_key=True, default=_new_uuid)
    exam_id = Column(String, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    student_number = Column(String, nullable=False)
    scan_image_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=_now)

    exam = relationship("Exam", back_populates="students")
    answers = relationship("StudentAnswer", back_populates="student", cascade="all, delete-orphan")


class StudentAnswer(Base):
    __tablename__ = "student_answers"

    id = Column(String, primary_key=True, default=_new_uuid)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    region_id = Column(String, ForeignKey("regions.id", ondelete="CASCADE"), nullable=False)
    ocr_text = Column(Text, nullable=True)
    ocr_confidence = Column(Float, nullable=True)
    score = Column(Float, nullable=True)
    is_ambiguous = Column(Boolean, default=False)
    ambiguity_reason = Column(Text, nullable=True)
    grading_status = Column(String, default="pending")  # pending, graded, needs_review
    grading_feedback = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    student = relationship("Student", back_populates="answers")
    region = relationship("Region", back_populates="student_answers")


class Settings(Base):
    __tablename__ = "settings"

    id = Column(String, primary_key=True, default=_new_uuid)
    llm_provider = Column(String, nullable=False, default="anthropic")
    llm_api_key = Column(String, nullable=True)
    llm_model = Column(String, nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)
