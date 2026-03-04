"""Initial application schema

Revision ID: 20260304_000001
Revises:
Create Date: 2026-03-04 23:30:00
"""

from __future__ import annotations

from typing import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260304_000001"
down_revision = None
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return inspector.has_table(table_name)


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    inspector = sa.inspect(op.get_bind())
    return any(index.get("name") == index_name for index in inspector.get_indexes(table_name))


def _create_index_if_missing(
    index_name: str,
    table_name: str,
    columns: Sequence[str],
    *,
    unique: bool = False,
) -> None:
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, list(columns), unique=unique)


def upgrade() -> None:
    if not _table_exists("runs"):
        op.create_table(
            "runs",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("pipeline_name", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("started_at", sa.String(), nullable=False),
            sa.Column("finished_at", sa.String(), nullable=True),
            sa.Column("log_file_path", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
    _create_index_if_missing("ix_runs_started_at", "runs", ["started_at"])

    if not _table_exists("run_sessions"):
        op.create_table(
            "run_sessions",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("run_id", sa.String(), nullable=False),
            sa.Column("step_id", sa.String(), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("command", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("exit_code", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["run_id"], ["runs.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    _create_index_if_missing("ix_run_sessions_run_id", "run_sessions", ["run_id"])
    _create_index_if_missing("ix_run_sessions_position", "run_sessions", ["position"])

    if not _table_exists("manual_terminals_history"):
        op.create_table(
            "manual_terminals_history",
            sa.Column("terminal_id", sa.String(), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("created_at", sa.String(), nullable=False),
            sa.Column("updated_at", sa.String(), nullable=False),
            sa.Column("closed_at", sa.String(), nullable=True),
            sa.Column("log_file_path", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("terminal_id"),
        )
    _create_index_if_missing(
        "ix_manual_terminals_history_updated_at",
        "manual_terminals_history",
        ["updated_at"],
    )

    if not _table_exists("manual_terminal_commands"):
        op.create_table(
            "manual_terminal_commands",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("terminal_id", sa.String(), nullable=False),
            sa.Column("command", sa.String(), nullable=False),
            sa.Column("created_at", sa.String(), nullable=False),
            sa.ForeignKeyConstraint(["terminal_id"], ["manual_terminals_history.terminal_id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    _create_index_if_missing(
        "ix_manual_terminal_commands_terminal_id",
        "manual_terminal_commands",
        ["terminal_id"],
    )

    if not _table_exists("command_packs"):
        op.create_table(
            "command_packs",
            sa.Column("pack_id", sa.String(), nullable=False),
            sa.Column("pack_name", sa.String(), nullable=False),
            sa.Column("description", sa.String(), nullable=False),
            sa.Column("source_name", sa.String(), nullable=False),
            sa.Column("is_core", sa.Boolean(), nullable=False),
            sa.Column("updated_at", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("pack_id"),
        )
    _create_index_if_missing("ix_command_packs_updated_at", "command_packs", ["updated_at"])

    if not _table_exists("command_templates"):
        op.create_table(
            "command_templates",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("pack_id", sa.String(), nullable=False),
            sa.Column("template_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("command", sa.String(), nullable=False),
            sa.Column("description", sa.String(), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["pack_id"], ["command_packs.pack_id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("pack_id", "template_id", name="uq_command_templates_pack_template"),
        )
    _create_index_if_missing("ix_command_templates_pack_id", "command_templates", ["pack_id"])
    _create_index_if_missing("ix_command_templates_template_id", "command_templates", ["template_id"])
    _create_index_if_missing("ix_command_templates_position", "command_templates", ["position"])

    if not _table_exists("pipeline_flows"):
        op.create_table(
            "pipeline_flows",
            sa.Column("flow_id", sa.String(), nullable=False),
            sa.Column("flow_name", sa.String(), nullable=False),
            sa.Column("created_at", sa.String(), nullable=False),
            sa.Column("updated_at", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("flow_id"),
        )
    _create_index_if_missing("ix_pipeline_flows_updated_at", "pipeline_flows", ["updated_at"])

    if not _table_exists("pipeline_flow_steps"):
        op.create_table(
            "pipeline_flow_steps",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("flow_id", sa.String(), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("step_type", sa.String(), nullable=False),
            sa.Column("label", sa.String(), nullable=False),
            sa.Column("command", sa.String(), nullable=False),
            sa.ForeignKeyConstraint(["flow_id"], ["pipeline_flows.flow_id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    _create_index_if_missing("ix_pipeline_flow_steps_flow_id", "pipeline_flow_steps", ["flow_id"])
    _create_index_if_missing("ix_pipeline_flow_steps_position", "pipeline_flow_steps", ["position"])


def downgrade() -> None:
    op.drop_index("ix_pipeline_flow_steps_position", table_name="pipeline_flow_steps")
    op.drop_index("ix_pipeline_flow_steps_flow_id", table_name="pipeline_flow_steps")
    op.drop_table("pipeline_flow_steps")

    op.drop_index("ix_pipeline_flows_updated_at", table_name="pipeline_flows")
    op.drop_table("pipeline_flows")

    op.drop_index("ix_command_templates_position", table_name="command_templates")
    op.drop_index("ix_command_templates_template_id", table_name="command_templates")
    op.drop_index("ix_command_templates_pack_id", table_name="command_templates")
    op.drop_table("command_templates")

    op.drop_index("ix_command_packs_updated_at", table_name="command_packs")
    op.drop_table("command_packs")

    op.drop_index("ix_manual_terminal_commands_terminal_id", table_name="manual_terminal_commands")
    op.drop_table("manual_terminal_commands")

    op.drop_index("ix_manual_terminals_history_updated_at", table_name="manual_terminals_history")
    op.drop_table("manual_terminals_history")

    op.drop_index("ix_run_sessions_position", table_name="run_sessions")
    op.drop_index("ix_run_sessions_run_id", table_name="run_sessions")
    op.drop_table("run_sessions")

    op.drop_index("ix_runs_started_at", table_name="runs")
    op.drop_table("runs")
