from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Answer(Base):
    __tablename__ = "answers"

    __table_args__ = (UniqueConstraint("student_id", "question_id", name="uq_answer_student_question"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    answer_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), server_default=func.now(), nullable=False
    )

    student: Mapped["Student"] = relationship("Student", back_populates="answers")
    question: Mapped["Question"] = relationship("Question", back_populates="answers")
    grading: Mapped[Optional["Grading"]] = relationship(
        "Grading", back_populates="answer", cascade="all, delete-orphan", uselist=False
    )
    cluster_members: Mapped[list["ClusterMember"]] = relationship(
        "ClusterMember", back_populates="answer"
    )
