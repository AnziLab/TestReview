"""add_grading_progress_fields

Revision ID: c4d8e2f31b09
Revises: a3f2c81e9b7a
Create Date: 2026-04-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d8e2f31b09'
down_revision: Union[str, None] = 'a3f2c81e9b7a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('exams', schema=None) as batch_op:
        batch_op.add_column(sa.Column('grading_status', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('grading_progress_current', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('grading_progress_total', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('grading_error', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('exams', schema=None) as batch_op:
        batch_op.drop_column('grading_error')
        batch_op.drop_column('grading_progress_total')
        batch_op.drop_column('grading_progress_current')
        batch_op.drop_column('grading_status')
