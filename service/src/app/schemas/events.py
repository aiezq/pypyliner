from __future__ import annotations

from typing import Literal, TypeAlias, TypedDict

from src.app.schemas.service_types import (
    PipelineRunData,
    StateSnapshotData,
    TerminalLineData,
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


RuntimeEventType: TypeAlias = Literal[
    "run_session_line",
    "run_status",
    "run_session_status",
    "run_created",
]

RuntimeEventData: TypeAlias = (
    RunSessionLineEventData
    | RunStatusEventData
    | RunSessionStatusEventData
    | RunCreatedEventData
)


class RuntimeEventMessage(TypedDict):
    type: RuntimeEventType
    data: RuntimeEventData


class SnapshotEventMessage(TypedDict):
    type: Literal["snapshot"]
    data: StateSnapshotData
