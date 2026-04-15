"""Initial schema — create all tables

Revision ID: 0001
Revises:
Create Date: 2026-04-14 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(50), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(100), nullable=False),
        sa.Column("school", sa.String(200), nullable=True),
        sa.Column("role", sa.String(20), nullable=False, server_default="teacher"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("gemini_api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ── exams ─────────────────────────────────────────────────────────────────
    op.create_table(
        "exams",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("subject", sa.String(100), nullable=False),
        sa.Column("grade", sa.String(20), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("rubric_source_filename", sa.String(255), nullable=True),
        sa.Column("rubric_source_path", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_exams_id", "exams", ["id"])

    # ── questions ─────────────────────────────────────────────────────────────
    op.create_table(
        "questions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.String(20), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("question_text", sa.Text(), nullable=True),
        sa.Column("max_score", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("model_answer", sa.Text(), nullable=True),
        sa.Column("rubric_json", sqlite.JSON(), nullable=False, server_default='{"criteria":[],"notes":""}'),
        sa.Column("rubric_draft_json", sqlite.JSON(), nullable=True),
        sa.Column("rubric_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("exam_id", "number", name="uq_question_exam_number"),
    )
    op.create_index("ix_questions_id", "questions", ["id"])

    # ── classes ───────────────────────────────────────────────────────────────
    op.create_table(
        "classes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("scan_mode", sa.String(10), nullable=False, server_default="single"),
        sa.Column("source_pdf_filename", sa.String(255), nullable=True),
        sa.Column("source_pdf_path", sa.String(500), nullable=True),
        sa.Column("ocr_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("ocr_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_classes_id", "classes", ["id"])

    # ── students ──────────────────────────────────────────────────────────────
    op.create_table(
        "students",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("class_id", sa.Integer(), sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_number", sa.String(20), nullable=True),
        sa.Column("name", sa.String(50), nullable=True),
        sa.Column("page_indices", sqlite.JSON(), nullable=False, server_default="[]"),
        sa.Column("ocr_confidence", sa.String(20), nullable=True),
        sa.Column("needs_review", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_students_id", "students", ["id"])

    # ── answers ───────────────────────────────────────────────────────────────
    op.create_table(
        "answers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("answer_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "question_id", name="uq_answer_student_question"),
    )
    op.create_index("ix_answers_id", "answers", ["id"])

    # ── refinement_sessions ───────────────────────────────────────────────────
    op.create_table(
        "refinement_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rubric_snapshot_json", sqlite.JSON(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_refinement_sessions_id", "refinement_sessions", ["id"])

    # ── answer_clusters ───────────────────────────────────────────────────────
    op.create_table(
        "answer_clusters",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("refinement_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("representative_text", sa.Text(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("judgable", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("suggested_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_answer_clusters_id", "answer_clusters", ["id"])

    # ── cluster_members ───────────────────────────────────────────────────────
    op.create_table(
        "cluster_members",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cluster_id", sa.Integer(), sa.ForeignKey("answer_clusters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("answer_id", sa.Integer(), sa.ForeignKey("answers.id", ondelete="CASCADE"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cluster_id", "answer_id", name="uq_cluster_member"),
    )
    op.create_index("ix_cluster_members_id", "cluster_members", ["id"])

    # ── gradings ──────────────────────────────────────────────────────────────
    op.create_table(
        "gradings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("answer_id", sa.Integer(), sa.ForeignKey("answers.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("score", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("matched_criteria_ids", sqlite.JSON(), nullable=True),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("graded_by", sa.String(20), nullable=False, server_default="auto"),
        sa.Column("graded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("rubric_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_gradings_id", "gradings", ["id"])


def downgrade() -> None:
    op.drop_table("gradings")
    op.drop_table("cluster_members")
    op.drop_table("answer_clusters")
    op.drop_table("refinement_sessions")
    op.drop_table("answers")
    op.drop_table("students")
    op.drop_table("classes")
    op.drop_table("questions")
    op.drop_table("exams")
    op.drop_table("users")
