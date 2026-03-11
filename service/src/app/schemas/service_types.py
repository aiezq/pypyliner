from __future__ import annotations

from typing import NotRequired, TypedDict


class TerminalLineData(TypedDict):
    id: str
    stream: str
    text: str
    created_at: str


class PipelineSessionData(TypedDict):
    id: str
    step_id: str
    title: str
    command: str
    status: str
    exit_code: int | None
    lines: list[TerminalLineData]


class PipelineRunData(TypedDict):
    id: str
    pipeline_name: str
    status: str
    started_at: str
    finished_at: str | None
    log_file_path: str
    sessions: list[PipelineSessionData]


class HistoryData(TypedDict):
    runs: list[PipelineRunData]


class TerminalCommandData(TypedDict):
    id: str
    node_id: str
    label: str
    original_command: str
    resolved_command: str
    status: str
    started_at: str | None
    finished_at: str | None
    exit_code: int | None


class TerminalSessionData(TypedDict):
    id: str
    terminal_node_id: str
    sequence_id: str | None
    title: str
    terminal_type: str
    ssh_connection_name: str | None
    ssh_host: str | None
    ssh_username: str | None
    status: str
    created_at: str
    started_at: str | None
    finished_at: str | None
    exit_code: int | None
    current_command_index: int | None
    current_command_id: str | None
    shell_pid: int | None
    stdin_enabled: bool
    queue: list[TerminalCommandData]
    lines: list[TerminalLineData]


class SequenceTerminalJobData(TypedDict):
    terminal_node_id: str
    terminal_session_id: str | None
    title: str
    terminal_type: str
    status: str


class SequenceExecutionData(TypedDict):
    id: str
    sequence_node_id: str
    status: str
    current_terminal_index: int | None
    created_at: str
    started_at: str | None
    finished_at: str | None
    terminal_jobs: list[SequenceTerminalJobData]


class StateSnapshotData(TypedDict):
    runs: list[PipelineRunData]
    terminals: list[TerminalSessionData]
    sequences: list[SequenceExecutionData]


class CommandTemplateData(TypedDict):
    id: str
    name: str
    command: str
    description: str


class CommandPackData(TypedDict):
    pack_id: str
    pack_name: str
    description: str
    file_name: str
    templates: list[CommandTemplateData]


class CommandPackListData(TypedDict):
    packs: list[CommandPackData]
    templates: list[CommandTemplateData]
    errors: list[str]


class CommandTemplateMutationData(TypedDict):
    id: str
    name: str
    command: str
    description: str
    pack_id: str
    pack_file: str
    moved_from_pack_id: NotRequired[str]


class CommandTemplateDeleteData(TypedDict):
    deleted: bool
    template_id: str
    pack_id: str
    pack_file: str


class CommandPackImportData(TypedDict):
    imported: bool
    pack_id: str
    pack_name: str
    file_name: str
    commands_count: int


class PipelineFlowStepData(TypedDict):
    type: str
    label: str
    command: str


class PipelineFlowData(TypedDict):
    id: str
    flow_name: str
    created_at: str
    updated_at: str
    file_name: str
    steps: list[PipelineFlowStepData]


class PipelineFlowListData(TypedDict):
    flows: list[PipelineFlowData]
    errors: list[str]


class PipelineFlowDeleteData(TypedDict):
    deleted: bool
    flow_id: str
