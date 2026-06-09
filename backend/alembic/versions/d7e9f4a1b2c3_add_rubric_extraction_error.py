"""add_rubric_extraction_error

Revision ID: d7e9f4a1b2c3
Revises: c4d8e2f31b09
Create Date: 2026-06-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7e9f4a1b2c3"
down_revision: Union[str, None] = "c4d8e2f31b09"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("exams", schema=None) as batch_op:
        batch_op.add_column(sa.Column("rubric_extraction_error", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("exams", schema=None) as batch_op:
        batch_op.drop_column("rubric_extraction_error")
