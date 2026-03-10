"""Preserve revision chain after terminal-history removal

Revision ID: 20260310_000002
Revises: 20260304_000001
Create Date: 2026-03-10 16:45:00
"""

from __future__ import annotations

# revision identifiers, used by Alembic.
revision = "20260310_000002"
down_revision = "20260304_000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    return None


def downgrade() -> None:
    return None
