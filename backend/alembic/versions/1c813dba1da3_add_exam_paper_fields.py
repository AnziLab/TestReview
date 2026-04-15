"""add_exam_paper_fields

Revision ID: 1c813dba1da3
Revises: 2f1c1c9cc2f3
Create Date: 2026-04-15 09:44:47.336163

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1c813dba1da3'
down_revision: Union[str, None] = '2f1c1c9cc2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('exams', schema=None) as batch_op:
        batch_op.add_column(sa.Column('exam_paper_filename', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('exam_paper_path', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('exam_paper_status', sa.String(length=20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('exams', schema=None) as batch_op:
        batch_op.drop_column('exam_paper_status')
        batch_op.drop_column('exam_paper_path')
        batch_op.drop_column('exam_paper_filename')
