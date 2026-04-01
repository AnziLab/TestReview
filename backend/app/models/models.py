import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
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
    page_number = Column(Integer, default=1, nullable=False)
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


class StudentPage(Base):
    __tablename__ = "student_pages"

    id = Column(String, primary_key=True, default=_new_uuid)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    page_number = Column(Integer, nullable=False)
    image_path = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=_now)

    student = relationship("Student", back_populates="pages")


class Student(Base):
    __tablename__ = "students"

    id = Column(String, primary_key=True, default=_new_uuid)
    exam_id = Column(String, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    student_number = Column(String, nullable=False)
    scan_image_path = Column(String, nullable=True)  # kept for backwards compat
    created_at = Column(DateTime, default=_now)

    exam = relationship("Exam", back_populates="students")
    answers = relationship("StudentAnswer", back_populates="student", cascade="all, delete-orphan")
    pages = relationship("StudentPage", back_populates="student", cascade="all, delete-orphan")


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
    grading_status = Column(String, default="pending")  # pending, 초검완료, 재검완료, needs_review
    grading_feedback = Column(Text, nullable=True)
    review_round = Column(Integer, default=1)  # 1=초검, 2=재검
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
    ocr_provider = Column(String(50), default="gpt")  # "gpt" or "clova"
    ocr_model = Column(String(100), nullable=True)  # e.g. "gpt-5.4-nano"
    clova_api_url = Column(String(500), nullable=True)
    clova_secret_key = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)
