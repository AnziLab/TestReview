from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Grading(Base):
    __tablename__ = "gradings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    answer_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("answers.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    matched_criteria_ids: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    rationale: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    graded_by: Mapped[str] = mapped_column(String(20), nullable=False, default="auto")
    graded_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    rubric_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
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

    answer: Mapped["Answer"] = relationship("Answer", back_populates="grading")
    grader: Mapped[Optional["User"]] = relationship("User", foreign_keys=[graded_by_user_id])
