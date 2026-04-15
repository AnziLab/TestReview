from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Exam(Base):
    __tablename__ = "exams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    teacher_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    grade: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    school_level: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rubric_source_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    rubric_source_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    exam_paper_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    exam_paper_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    exam_paper_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # processing|done|failed
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    teacher: Mapped["User"] = relationship("User", back_populates="exams")
    questions: Mapped[list["Question"]] = relationship(
        "Question", back_populates="exam", cascade="all, delete-orphan"
    )
    classes: Mapped[list["Class"]] = relationship(
        "Class", back_populates="exam", cascade="all, delete-orphan"
    )


class Question(Base):
    __tablename__ = "questions"

    __table_args__ = (UniqueConstraint("exam_id", "number", name="uq_question_exam_number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    exam_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False
    )
    number: Mapped[str] = mapped_column(String(20), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    question_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    max_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    model_answer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rubric_json: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=lambda: {"criteria": [], "notes": ""}
    )
    rubric_draft_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    rubric_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    exam: Mapped["Exam"] = relationship("Exam", back_populates="questions")
    answers: Mapped[list["Answer"]] = relationship("Answer", back_populates="question")
    refinement_sessions: Mapped[list["RefinementSession"]] = relationship(
        "RefinementSession", back_populates="question", cascade="all, delete-orphan"
    )
