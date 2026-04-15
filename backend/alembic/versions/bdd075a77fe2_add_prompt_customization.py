"""add_prompt_customization

Revision ID: bdd075a77fe2
Revises: 14f94e26bc09
Create Date: 2026-04-15 14:47:47.994408

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bdd075a77fe2'
down_revision: Union[str, None] = '14f94e26bc09'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('grading_extra_instructions', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('clustering_extra_instructions', sa.Text(), nullable=True))

def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('clustering_extra_instructions')
        batch_op.drop_column('grading_extra_instructions')
