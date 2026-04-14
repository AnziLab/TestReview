"""alter_exam_subject_nullable_grade_int_add_school_level

Revision ID: 2f1c1c9cc2f3
Revises: 0001
Create Date: 2026-04-14 22:16:46.253170

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f1c1c9cc2f3'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('exams', schema=None) as batch_op:
        batch_op.add_column(sa.Column('school_level', sa.String(length=20), nullable=True))
        batch_op.alter_column('subject',
               existing_type=sa.VARCHAR(length=100),
               nullable=True)
        batch_op.alter_column('grade',
               existing_type=sa.VARCHAR(length=20),
               type_=sa.Integer(),
               existing_nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('exams', schema=None) as batch_op:
        batch_op.alter_column('grade',
               existing_type=sa.Integer(),
               type_=sa.VARCHAR(length=20),
               existing_nullable=True)
        batch_op.alter_column('subject',
               existing_type=sa.VARCHAR(length=100),
               nullable=False)
        batch_op.drop_column('school_level')
