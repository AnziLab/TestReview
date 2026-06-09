"""add_student_ocr_error

Revision ID: f9a1b6c3d4e5
Revises: e8f0a5b2c3d4
Create Date: 2026-06-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f9a1b6c3d4e5"
down_revision: Union[str, None] = "e8f0a5b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("students", schema=None) as batch_op:
        batch_op.add_column(sa.Column("ocr_error", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("students", schema=None) as batch_op:
        batch_op.drop_column("ocr_error")
