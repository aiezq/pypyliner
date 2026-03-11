from __future__ import annotations

from typing import Literal, TypeAlias, TypedDict

from src.app.schemas.service_types import (
    PipelineRunData,
    SequenceExecutionData,
    StateSnapshotData,
    TerminalCommandData,
    TerminalLineData,
    TerminalSessionData,
)


class RunSessionLineEventData(TypedDict):
    run_id: str
    session_id: str
    line: TerminalLineData


class RunStatusEventData(TypedDict):
    run_id: str
    status: str
    finished_at: str | None


class RunSessionStatusEventData(TypedDict):
    run_id: str
    session_id: str
    status: str
    exit_code: int | None


class RunCreatedEventData(TypedDict):
    run: PipelineRunData


class TerminalCreatedEventData(TypedDict):
    terminal: TerminalSessionData


class TerminalStatusEventData(TypedDict):
    terminal_session_id: str
    terminal_node_id: str
    sequence_id: str | None
    status: str
    current_command_index: int | None
    current_command_id: str | None
    exit_code: int | None
    started_at: str | None
    finished_at: str | None
    shell_pid: int | None
    stdin_enabled: bool


class TerminalLineEventData(TypedDict):
    terminal_session_id: str
    line: TerminalLineData


class TerminalDeletedEventData(TypedDict):
    terminal_session_id: str


class TerminalCommandStatusEventData(TypedDict):
    terminal_session_id: str
    command: TerminalCommandData
    current_command_index: int | None


class TerminalQueueChangedEventData(TypedDict):
    terminal_session_id: str
    queue: list[TerminalCommandData]
    current_command_index: int | None


class SequenceCreatedEventData(TypedDict):
    sequence: SequenceExecutionData


class SequenceStatusEventData(TypedDict):
    sequence_id: str
    sequence_node_id: str
    status: str
    current_terminal_index: int | None
    finished_at: str | None


RuntimeEventType: TypeAlias = Literal[
    "run_session_line",
    "run_status",
    "run_session_status",
    "run_created",
    "terminal_created",
    "terminal_status",
    "terminal_line",
    "terminal_deleted",
    "terminal_command_status",
    "terminal_queue_changed",
    "sequence_created",
    "sequence_status",
]

RuntimeEventData: TypeAlias = (
    RunSessionLineEventData
    | RunStatusEventData
    | RunSessionStatusEventData
    | RunCreatedEventData
    | TerminalCreatedEventData
    | TerminalStatusEventData
    | TerminalLineEventData
    | TerminalDeletedEventData
    | TerminalCommandStatusEventData
    | TerminalQueueChangedEventData
    | SequenceCreatedEventData
    | SequenceStatusEventData
)


class RuntimeEventMessage(TypedDict):
    type: RuntimeEventType
    data: RuntimeEventData


class SnapshotEventMessage(TypedDict):
    type: Literal["snapshot"]
    data: StateSnapshotData
