"""Add is_sequence to manual terminal history

Revision ID: 20260310_000002
Revises: 20260304_000001
Create Date: 2026-03-10 16:45:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260310_000002"
down_revision = "20260304_000001"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return inspector.has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    inspector = sa.inspect(op.get_bind())
    return any(column.get("name") == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    if not _column_exists("manual_terminals_history", "is_sequence"):
        op.add_column(
            "manual_terminals_history",
            sa.Column("is_sequence", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    if _column_exists("manual_terminals_history", "is_sequence"):
        op.drop_column("manual_terminals_history", "is_sequence")
