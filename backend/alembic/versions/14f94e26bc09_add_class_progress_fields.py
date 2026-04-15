"""add_class_progress_fields

Revision ID: 14f94e26bc09
Revises: 1c813dba1da3
Create Date: 2026-04-15 12:31:05.652982

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '14f94e26bc09'
down_revision: Union[str, None] = '1c813dba1da3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('classes', schema=None) as batch_op:
        batch_op.add_column(sa.Column('source_pdf_pages', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('students_processed', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('classes', schema=None) as batch_op:
        batch_op.drop_column('students_processed')
        batch_op.drop_column('source_pdf_pages')
