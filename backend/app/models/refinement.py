from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RefinementSession(Base):
    __tablename__ = "refinement_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    question_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    rubric_snapshot_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    question: Mapped["Question"] = relationship("Question", back_populates="refinement_sessions")
    clusters: Mapped[list["AnswerCluster"]] = relationship(
        "AnswerCluster", back_populates="session", cascade="all, delete-orphan"
    )


class AnswerCluster(Base):
    __tablename__ = "answer_clusters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("refinement_sessions.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    representative_text: Mapped[str] = mapped_column(Text, nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    judgable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    suggested_score: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), server_default=func.now(), nullable=False
    )

    session: Mapped["RefinementSession"] = relationship("RefinementSession", back_populates="clusters")
    members: Mapped[list["ClusterMember"]] = relationship(
        "ClusterMember", back_populates="cluster", cascade="all, delete-orphan"
    )


class ClusterMember(Base):
    __tablename__ = "cluster_members"

    __table_args__ = (UniqueConstraint("cluster_id", "answer_id", name="uq_cluster_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cluster_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("answer_clusters.id", ondelete="CASCADE"), nullable=False
    )
    answer_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("answers.id", ondelete="CASCADE"), nullable=False
    )

    cluster: Mapped["AnswerCluster"] = relationship("AnswerCluster", back_populates="members")
    answer: Mapped["Answer"] = relationship("Answer", back_populates="cluster_members")
