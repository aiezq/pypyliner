from __future__ import annotations

from typing import Any

from sqlmodel import Field, SQLModel
from sqlalchemy import UniqueConstraint


class RunRecord(SQLModel, table=True):
    __tablename__: Any = "runs"

    id: str = Field(primary_key=True)
    pipeline_name: str
    status: str
    started_at: str = Field(index=True)
    finished_at: str | None = None
    log_file_path: str


class RunSessionRecord(SQLModel, table=True):
    __tablename__: Any = "run_sessions"

    id: str = Field(primary_key=True)
    run_id: str = Field(foreign_key="runs.id", index=True)
    step_id: str
    position: int = Field(default=0, index=True)
    title: str
    command: str
    status: str
    exit_code: int | None = None


class ManualTerminalHistoryRecord(SQLModel, table=True):
    __tablename__: Any = "manual_terminals_history"

    terminal_id: str = Field(primary_key=True)
    title: str
    created_at: str
    updated_at: str = Field(index=True)
    closed_at: str | None = None
    log_file_path: str


class ManualTerminalCommandRecord(SQLModel, table=True):
    __tablename__: Any = "manual_terminal_commands"

    id: int | None = Field(default=None, primary_key=True)
    terminal_id: str = Field(foreign_key="manual_terminals_history.terminal_id", index=True)
    command: str
    created_at: str


class CommandPackRecord(SQLModel, table=True):
    __tablename__: Any = "command_packs"

    pack_id: str = Field(primary_key=True)
    pack_name: str
    description: str = ""
    source_name: str
    is_core: bool = False
    updated_at: str = Field(index=True)


class CommandTemplateRecord(SQLModel, table=True):
    __tablename__: Any = "command_templates"
    __table_args__ = (
        UniqueConstraint("pack_id", "template_id", name="uq_command_templates_pack_template"),
    )

    id: int | None = Field(default=None, primary_key=True)
    pack_id: str = Field(foreign_key="command_packs.pack_id", index=True)
    template_id: str = Field(index=True)
    name: str
    command: str
    description: str = ""
    position: int = Field(default=0, index=True)


class PipelineFlowRecord(SQLModel, table=True):
    __tablename__: Any = "pipeline_flows"

    flow_id: str = Field(primary_key=True)
    flow_name: str
    created_at: str
    updated_at: str = Field(index=True)


class PipelineFlowStepRecord(SQLModel, table=True):
    __tablename__: Any = "pipeline_flow_steps"

    id: int | None = Field(default=None, primary_key=True)
    flow_id: str = Field(foreign_key="pipeline_flows.flow_id", index=True)
    position: int = Field(default=0, index=True)
    step_type: str
    label: str
    command: str
