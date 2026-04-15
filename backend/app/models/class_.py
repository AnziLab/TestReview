from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Class(Base):
    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    exam_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    scan_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="single")
    source_pdf_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_pdf_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    ocr_status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    ocr_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_pdf_pages: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    students_processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
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

    exam: Mapped["Exam"] = relationship("Exam", back_populates="classes")
    students: Mapped[list["Student"]] = relationship(
        "Student", back_populates="class_", cascade="all, delete-orphan"
    )


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    class_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False
    )
    student_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    page_indices: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    ocr_confidence: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
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

    class_: Mapped["Class"] = relationship("Class", back_populates="students")
    answers: Mapped[list["Answer"]] = relationship(
        "Answer", back_populates="student", cascade="all, delete-orphan"
    )
