"""add_full_prompt_overrides

Revision ID: a3f2c81e9b7a
Revises: bdd075a77fe2
Create Date: 2026-04-25 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f2c81e9b7a'
down_revision: Union[str, None] = 'bdd075a77fe2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PROMPT_COLUMNS = (
    'ocr_prompt_override',
    'grading_prompt_override',
    'clustering_prompt_override',
    'rubric_extract_prompt_override',
    'rubric_generate_prompt_override',
    'exam_paper_extract_prompt_override',
)


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        for col in PROMPT_COLUMNS:
            batch_op.add_column(sa.Column(col, sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        for col in reversed(PROMPT_COLUMNS):
            batch_op.drop_column(col)
