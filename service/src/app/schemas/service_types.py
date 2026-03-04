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


class ManualTerminalData(TypedDict):
    id: str
    title: str
    prompt_user: str
    prompt_cwd: str
    status: str
    exit_code: int | None
    created_at: str
    draft_command: str
    log_file_path: str
    lines: list[TerminalLineData]


class ManualTerminalHistoryItemData(TypedDict):
    terminal_id: str
    title: str
    created_at: str
    updated_at: str
    closed_at: str | None
    log_file_path: str
    commands: list[str]


class HistoryData(TypedDict):
    runs: list[PipelineRunData]
    manual_terminal_history: list[ManualTerminalHistoryItemData]


class StateSnapshotData(TypedDict):
    runs: list[PipelineRunData]
    manual_terminals: list[ManualTerminalData]


class CompletionData(TypedDict):
    terminal_id: str
    command: str
    base_command: str
    completed_command: str
    matches: list[str]


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
