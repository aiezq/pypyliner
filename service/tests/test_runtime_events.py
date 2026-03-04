from __future__ import annotations

from pathlib import Path
from typing import Awaitable, Callable, cast
from unittest.mock import AsyncMock

import pytest

from src.app.services.runtime import (
    ManualTerminalState,
    PipelineRunState,
    PipelineSessionState,
    RuntimeManager,
    TerminalLine,
)


def _line(line_id: str, text: str, stream: str = "out") -> TerminalLine:
    return TerminalLine(
        id=line_id,
        stream=stream,  # type: ignore[arg-type]
        text=text,
        created_at="2026-03-05T00:00:00Z",
    )


def _run(run_id: str, session: PipelineSessionState) -> PipelineRunState:
    return PipelineRunState(
        id=run_id,
        pipeline_name="Demo pipeline",
        status="running",
        started_at="2026-03-05T00:00:00Z",
        finished_at=None,
        log_file_path=Path("/tmp/test-run.log"),
        sessions=[session],
    )


def _terminal(terminal_id: str) -> ManualTerminalState:
    return ManualTerminalState(
        id=terminal_id,
        title="Terminal #1",
        prompt_user="operator",
        prompt_cwd="~",
        status="idle",
        exit_code=None,
        created_at="2026-03-05T00:00:00Z",
        log_file_path=Path("/tmp/test-terminal.log"),
    )


def test_snapshot_event_contains_serialized_state() -> None:
    runtime = RuntimeManager()
    session = PipelineSessionState(
        id="session_1",
        step_id="step_1",
        title="Step #1",
        command="echo 1",
        status="running",
        exit_code=None,
        lines=[_line("line_1", "hello")],
    )
    run = _run("run_1", session)
    terminal = _terminal("terminal_1")
    terminal.lines.append(_line("line_2", "prompt", "meta"))

    runtime.runs[run.id] = run
    runtime.manual_terminals[terminal.id] = terminal

    event = runtime.snapshot_event()

    assert event["type"] == "snapshot"
    assert event["data"]["runs"][0]["id"] == "run_1"
    assert event["data"]["runs"][0]["sessions"][0]["lines"][0]["text"] == "hello"
    assert event["data"]["manual_terminals"][0]["id"] == "terminal_1"
    assert event["data"]["manual_terminals"][0]["lines"][0]["stream"] == "meta"


@pytest.mark.asyncio
async def test_append_pipeline_line_broadcast_payload() -> None:
    runtime = RuntimeManager()
    runtime.events.broadcast = AsyncMock()
    setattr(runtime, "_append_log", AsyncMock())

    session = PipelineSessionState(
        id="session_1",
        step_id="step_1",
        title="Step #1",
        command="echo 1",
        status="running",
        exit_code=None,
    )
    run = _run("run_1", session)

    append_pipeline_line = cast(
        Callable[[PipelineRunState, PipelineSessionState, str, str], Awaitable[None]],
        getattr(runtime, "_append_pipeline_line"),
    )
    await append_pipeline_line(run, session, "out", "hello world")

    assert len(session.lines) == 1
    runtime.events.broadcast.assert_awaited_once()
    assert runtime.events.broadcast.await_args is not None
    event_type, payload = runtime.events.broadcast.await_args.args
    assert event_type == "run_session_line"
    assert payload["run_id"] == "run_1"
    assert payload["session_id"] == "session_1"
    assert payload["line"]["stream"] == "out"
    assert payload["line"]["text"] == "hello world"


@pytest.mark.asyncio
async def test_emit_terminal_status_broadcast_payload() -> None:
    runtime = RuntimeManager()
    runtime.events.broadcast = AsyncMock()

    terminal = _terminal("terminal_1")
    terminal.status = "running"
    terminal.exit_code = 0

    emit_terminal_status = cast(
        Callable[[ManualTerminalState], Awaitable[None]],
        getattr(runtime, "_emit_terminal_status"),
    )
    await emit_terminal_status(terminal)

    runtime.events.broadcast.assert_awaited_once()
    assert runtime.events.broadcast.await_args is not None
    event_type, payload = runtime.events.broadcast.await_args.args
    assert event_type == "terminal_status"
    assert payload == {
        "terminal_id": "terminal_1",
        "status": "running",
        "exit_code": 0,
    }


@pytest.mark.asyncio
async def test_close_manual_terminal_broadcast_payload() -> None:
    runtime = RuntimeManager()
    runtime.events.broadcast = AsyncMock()

    terminal = _terminal("terminal_1")
    runtime.manual_terminals[terminal.id] = terminal

    await runtime.close_manual_terminal("terminal_1")

    assert "terminal_1" not in runtime.manual_terminals
    runtime.events.broadcast.assert_awaited_once_with(
        "terminal_closed",
        {"terminal_id": "terminal_1"},
    )
