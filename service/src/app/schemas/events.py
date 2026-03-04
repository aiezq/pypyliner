from __future__ import annotations

from typing import Literal, TypeAlias, TypedDict

from src.app.schemas.service_types import (
    ManualTerminalData,
    PipelineRunData,
    StateSnapshotData,
    TerminalLineData,
)


class RunSessionLineEventData(TypedDict):
    run_id: str
    session_id: str
    line: TerminalLineData


class TerminalLineEventData(TypedDict):
    terminal_id: str
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


class TerminalStatusEventData(TypedDict):
    terminal_id: str
    status: str
    exit_code: int | None


class RunCreatedEventData(TypedDict):
    run: PipelineRunData


class TerminalCreatedEventData(TypedDict):
    terminal: ManualTerminalData


class TerminalUpdatedEventData(TypedDict):
    terminal: ManualTerminalData


class TerminalClosedEventData(TypedDict):
    terminal_id: str


RuntimeEventType: TypeAlias = Literal[
    "run_session_line",
    "terminal_line",
    "run_status",
    "run_session_status",
    "terminal_status",
    "run_created",
    "terminal_created",
    "terminal_updated",
    "terminal_closed",
]

RuntimeEventData: TypeAlias = (
    RunSessionLineEventData
    | TerminalLineEventData
    | RunStatusEventData
    | RunSessionStatusEventData
    | TerminalStatusEventData
    | RunCreatedEventData
    | TerminalCreatedEventData
    | TerminalUpdatedEventData
    | TerminalClosedEventData
)


class RuntimeEventMessage(TypedDict):
    type: RuntimeEventType
    data: RuntimeEventData


class SnapshotEventMessage(TypedDict):
    type: Literal["snapshot"]
    data: StateSnapshotData
