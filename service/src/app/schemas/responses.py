from __future__ import annotations

from pydantic import BaseModel, Field


def _new_terminal_lines() -> list["TerminalLineResponse"]:
    return []


def _new_pipeline_sessions() -> list["PipelineSessionResponse"]:
    return []


def _new_pipeline_runs() -> list["PipelineRunResponse"]:
    return []


def _new_terminal_commands() -> list["TerminalCommandResponse"]:
    return []


def _new_terminal_sessions() -> list["TerminalSessionResponse"]:
    return []


def _new_sequence_terminal_jobs() -> list["SequenceTerminalJobResponse"]:
    return []


def _new_sequence_executions() -> list["SequenceExecutionResponse"]:
    return []


def _new_command_templates() -> list["CommandTemplateResponse"]:
    return []


def _new_command_packs() -> list["CommandPackResponse"]:
    return []


def _new_pipeline_flow_steps() -> list["PipelineFlowStepResponse"]:
    return []


def _new_pipeline_flows() -> list["PipelineFlowResponse"]:
    return []


class TerminalLineResponse(BaseModel):
    id: str
    stream: str
    text: str
    created_at: str


class PipelineSessionResponse(BaseModel):
    id: str
    step_id: str
    title: str
    command: str
    status: str
    exit_code: int | None = None
    lines: list[TerminalLineResponse] = Field(default_factory=_new_terminal_lines)


class PipelineRunResponse(BaseModel):
    id: str
    pipeline_name: str
    status: str
    started_at: str
    finished_at: str | None = None
    log_file_path: str
    sessions: list[PipelineSessionResponse] = Field(default_factory=_new_pipeline_sessions)


class RunsListResponse(BaseModel):
    runs: list[PipelineRunResponse] = Field(default_factory=_new_pipeline_runs)


class TerminalCommandResponse(BaseModel):
    id: str
    node_id: str
    label: str
    original_command: str
    resolved_command: str
    status: str
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None


class TerminalSessionResponse(BaseModel):
    id: str
    terminal_node_id: str
    sequence_id: str | None = None
    title: str
    terminal_type: str
    ssh_connection_name: str | None = None
    ssh_host: str | None = None
    ssh_username: str | None = None
    status: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None
    current_command_index: int | None = None
    current_command_id: str | None = None
    shell_pid: int | None = None
    stdin_enabled: bool = False
    queue: list[TerminalCommandResponse] = Field(default_factory=_new_terminal_commands)
    lines: list[TerminalLineResponse] = Field(default_factory=_new_terminal_lines)


class TerminalsListResponse(BaseModel):
    terminals: list[TerminalSessionResponse] = Field(default_factory=_new_terminal_sessions)


class SequenceTerminalJobResponse(BaseModel):
    terminal_node_id: str
    terminal_session_id: str | None = None
    title: str
    terminal_type: str
    status: str


class SequenceExecutionResponse(BaseModel):
    id: str
    sequence_node_id: str
    status: str
    current_terminal_index: int | None = None
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    terminal_jobs: list[SequenceTerminalJobResponse] = Field(default_factory=_new_sequence_terminal_jobs)


class SequencesListResponse(BaseModel):
    sequences: list[SequenceExecutionResponse] = Field(default_factory=_new_sequence_executions)


class HistoryResponse(BaseModel):
    runs: list[PipelineRunResponse] = Field(default_factory=_new_pipeline_runs)


class StateSnapshotResponse(BaseModel):
    runs: list[PipelineRunResponse] = Field(default_factory=_new_pipeline_runs)
    terminals: list[TerminalSessionResponse] = Field(default_factory=_new_terminal_sessions)
    sequences: list[SequenceExecutionResponse] = Field(default_factory=_new_sequence_executions)


class HealthResponse(BaseModel):
    status: str
    timestamp: str


class CommandTemplateResponse(BaseModel):
    id: str
    name: str
    command: str
    description: str


class CommandPackResponse(BaseModel):
    pack_id: str
    pack_name: str
    description: str
    file_name: str
    templates: list[CommandTemplateResponse] = Field(default_factory=_new_command_templates)


class CommandPackListResponse(BaseModel):
    packs: list[CommandPackResponse] = Field(default_factory=_new_command_packs)
    templates: list[CommandTemplateResponse] = Field(default_factory=_new_command_templates)
    errors: list[str] = Field(default_factory=list)


class CommandTemplateMutationResponse(BaseModel):
    id: str
    name: str
    command: str
    description: str
    pack_id: str
    pack_file: str
    moved_from_pack_id: str | None = None


class CommandTemplateDeleteResponse(BaseModel):
    deleted: bool
    template_id: str
    pack_id: str
    pack_file: str


class CommandPackImportResponse(BaseModel):
    imported: bool
    pack_id: str
    pack_name: str
    file_name: str
    commands_count: int


class PipelineFlowStepResponse(BaseModel):
    type: str
    label: str
    command: str


class PipelineFlowResponse(BaseModel):
    id: str
    flow_name: str
    created_at: str
    updated_at: str
    file_name: str
    steps: list[PipelineFlowStepResponse] = Field(default_factory=_new_pipeline_flow_steps)


class PipelineFlowListResponse(BaseModel):
    flows: list[PipelineFlowResponse] = Field(default_factory=_new_pipeline_flows)
    errors: list[str] = Field(default_factory=list)


class PipelineFlowDeleteResponse(BaseModel):
    deleted: bool
    flow_id: str
