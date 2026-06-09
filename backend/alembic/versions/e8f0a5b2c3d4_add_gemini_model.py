"""add_gemini_model

Revision ID: e8f0a5b2c3d4
Revises: d7e9f4a1b2c3
Create Date: 2026-06-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e8f0a5b2c3d4"
down_revision: Union[str, None] = "d7e9f4a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("gemini_model", sa.String(length=100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("gemini_model")
