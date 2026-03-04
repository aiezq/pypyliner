from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Awaitable, Callable, cast
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.app.core.constants import PIPELINE_OPEN_TERMINAL_COMMAND, PROMPT_STATE_MARKER
from src.app.schemas.pipeline import PipelineRunCreatePayload, PipelineStepPayload
from src.app.schemas.terminal import (
    ManualTerminalAutocompletePayload,
    ManualTerminalCommandPayload,
    ManualTerminalCreatePayload,
    ManualTerminalRenamePayload,
)
from src.app.services.runtime import (
    EventHub,
    ManualTerminalState,
    PipelineRunState,
    PipelineSessionState,
    RuntimeManager,
    ServiceError,
)


class FakeWebSocket:
    def __init__(self, *, fail_send: bool = False) -> None:
        self.fail_send = fail_send
        self.accepted = False
        self.sent: list[object] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, payload: object) -> None:
        self.sent.append(payload)
        if self.fail_send:
            raise RuntimeError("send failed")


class FakeStream:
    def __init__(self, items: list[bytes | BaseException]) -> None:
        self._items = items

    async def readline(self) -> bytes:
        if not self._items:
            return b""
        item = self._items.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item


class FakeStdin:
    def __init__(self, *, fail_drain: bool = False) -> None:
        self.fail_drain = fail_drain
        self.writes: list[bytes] = []

    def write(self, data: bytes) -> None:
        self.writes.append(data)

    async def drain(self) -> None:
        if self.fail_drain:
            raise BrokenPipeError("stdin is closed")


class FakeProcess:
    def __init__(
        self,
        *,
        returncode: int | None = None,
        wait_results: list[int] | None = None,
        stdin: FakeStdin | None = None,
        stdout: FakeStream | None = None,
        stderr: FakeStream | None = None,
    ) -> None:
        self.returncode = returncode
        self._wait_results = wait_results or [0]
        self.stdin = stdin
        self.stdout = stdout
        self.stderr = stderr
        self.terminated = False
        self.killed = False

    async def wait(self) -> int:
        if self._wait_results:
            result = self._wait_results.pop(0)
            self.returncode = result
            return result
        return self.returncode or 0

    def terminate(self) -> None:
        self.terminated = True

    def kill(self) -> None:
        self.killed = True


def _make_terminal(terminal_id: str = "terminal_1") -> ManualTerminalState:
    return ManualTerminalState(
        id=terminal_id,
        title="Terminal #1",
        prompt_user="operator",
        prompt_cwd="~",
        status="idle",
        exit_code=None,
        created_at="2026-03-05T00:00:00Z",
        log_file_path=Path(f"/tmp/{terminal_id}.log"),
    )


def _make_run(run_id: str, *sessions: PipelineSessionState) -> PipelineRunState:
    return PipelineRunState(
        id=run_id,
        pipeline_name="Demo",
        status="running",
        started_at="2026-03-05T00:00:00Z",
        finished_at=None,
        log_file_path=Path(f"/tmp/{run_id}.log"),
        sessions=list(sessions),
    )


def _make_session(session_id: str, command: str) -> PipelineSessionState:
    return PipelineSessionState(
        id=session_id,
        step_id=f"{session_id}_step",
        title=f"{session_id}_title",
        command=command,
        status="pending",
        exit_code=None,
    )


@pytest.mark.asyncio
async def test_event_hub_broadcast_removes_stale_clients() -> None:
    hub = EventHub()
    healthy = FakeWebSocket()
    stale = FakeWebSocket(fail_send=True)

    await hub.connect(cast(Any, healthy))
    await hub.connect(cast(Any, stale))
    await hub.broadcast(
        "terminal_status",
        {"terminal_id": "terminal_1", "status": "running", "exit_code": None},
    )
    await hub.broadcast(
        "terminal_status",
        {"terminal_id": "terminal_1", "status": "running", "exit_code": None},
    )

    assert healthy.accepted is True
    assert stale.accepted is True
    assert len(healthy.sent) == 2
    assert len(stale.sent) == 1

    await hub.disconnect(cast(Any, healthy))
    await hub.disconnect(cast(Any, stale))


@pytest.mark.asyncio
async def test_runtime_process_helpers(monkeypatch: pytest.MonkeyPatch) -> None:
    runtime = RuntimeManager()
    terminate_process = cast(
        Callable[[FakeProcess], Awaitable[None]],
        getattr(runtime, "_terminate_process"),
    )

    already_done = FakeProcess(returncode=0, wait_results=[0])
    await terminate_process(already_done)
    assert already_done.terminated is False

    timed_out = FakeProcess(returncode=None, wait_results=[0])

    async def fake_wait_for(_awaitable: object, timeout: float) -> object:
        assert timeout == 2.0
        close = getattr(_awaitable, "close", None)
        if callable(close):
            close()
        raise asyncio.TimeoutError()

    monkeypatch.setattr(asyncio, "wait_for", fake_wait_for)
    await terminate_process(timed_out)
    assert timed_out.terminated is True
    assert timed_out.killed is True


@pytest.mark.asyncio
async def test_runtime_prompt_probe_and_stream_handling() -> None:
    runtime = RuntimeManager()
    request_probe = cast(
        Callable[[ManualTerminalState], Awaitable[None]],
        getattr(runtime, "_request_manual_prompt_probe"),
    )
    stream_output = cast(
        Callable[[ManualTerminalState, FakeStream | None, str], Awaitable[None]],
        getattr(runtime, "_stream_manual_terminal_output"),
    )

    terminal = _make_terminal()
    await request_probe(terminal)

    good_stdin = FakeStdin()
    terminal.current_process = cast(Any, FakeProcess(returncode=None, stdin=good_stdin))
    await request_probe(terminal)
    assert good_stdin.writes
    assert PROMPT_STATE_MARKER.encode() in good_stdin.writes[-1]

    bad_stdin = FakeStdin(fail_drain=True)
    terminal.current_process = cast(Any, FakeProcess(returncode=None, stdin=bad_stdin))
    await request_probe(terminal)

    runtime.events.broadcast = AsyncMock()
    setattr(runtime, "_append_manual_line", AsyncMock())
    terminal.prompt_user = "operator"
    terminal.prompt_cwd = "~"
    stream = FakeStream(
        [
            f"{PROMPT_STATE_MARKER}\tdev\t/tmp\n".encode(),
            b"hello\n",
            b"",
        ]
    )
    await stream_output(terminal, stream, "out")
    runtime.events.broadcast.assert_awaited_once()

    broken_stream = FakeStream([RuntimeError("broken stream")])
    await stream_output(terminal, broken_stream, "err")
    append_manual = cast(AsyncMock, getattr(runtime, "_append_manual_line"))
    assert append_manual.await_count >= 2


@pytest.mark.asyncio
async def test_runtime_execute_command_and_watcher_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    runtime = RuntimeManager()
    execute_command = cast(
        Callable[
            [str, Callable[[str, str], Awaitable[None]], Callable[[Any], None]],
            Awaitable[int],
        ],
        getattr(runtime, "_execute_command"),
    )
    watch_process = cast(
        Callable[[ManualTerminalState, Any], Awaitable[None]],
        getattr(runtime, "_watch_manual_terminal_process"),
    )

    process = FakeProcess(
        returncode=None,
        wait_results=[0],
        stdout=FakeStream([b"out line\n", b""]),
        stderr=FakeStream([b"err line\n", b""]),
    )

    async def fake_create_subprocess_shell(*_args: object, **_kwargs: object) -> FakeProcess:
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_shell", fake_create_subprocess_shell)

    lines: list[tuple[str, str]] = []
    captured_processes: list[Any] = []

    async def on_line(stream: str, text: str) -> None:
        lines.append((stream, text))

    def set_process(proc: Any) -> None:
        captured_processes.append(proc)

    code = await execute_command("echo hi", on_line, set_process)
    assert code == 0
    assert captured_processes[0] is process
    assert captured_processes[-1] is None
    assert ("meta", "$ echo hi") in lines
    assert ("out", "out line") in lines
    assert ("err", "err line") in lines

    runtime.events.broadcast = AsyncMock()
    setattr(runtime, "_append_manual_line", AsyncMock())
    setattr(runtime, "_emit_terminal_status", AsyncMock())

    terminal = _make_terminal("terminal_watch")
    runtime.manual_terminals[terminal.id] = terminal

    terminal.current_process = cast(Any, FakeProcess(wait_results=[3]))
    await watch_process(terminal, cast(Any, terminal.current_process))
    assert terminal.status == "stopped"
    assert terminal.exit_code == 3

    stopped = _make_terminal("terminal_stopped")
    stopped.stop_requested = True
    runtime.manual_terminals[stopped.id] = stopped
    stopped.current_process = cast(Any, FakeProcess(wait_results=[0]))
    await watch_process(stopped, cast(Any, stopped.current_process))
    assert stopped.exit_code == -1

    removed = _make_terminal("terminal_removed")
    removed.current_process = cast(Any, FakeProcess(wait_results=[0]))
    await watch_process(removed, cast(Any, removed.current_process))


@pytest.mark.asyncio
async def test_runtime_pipeline_run_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    runtime = RuntimeManager()
    execute_pipeline = cast(
        Callable[[PipelineRunState], Awaitable[None]],
        getattr(runtime, "_execute_pipeline_run"),
    )

    setattr(runtime, "_persist_run", MagicMock())
    setattr(runtime, "_append_log", AsyncMock())
    runtime.events.broadcast = AsyncMock()

    created_coroutines: list[object] = []

    def fake_create_task(coro: Any) -> object:
        created_coroutines.append(coro)
        coro.close()
        return SimpleNamespace()

    monkeypatch.setattr(asyncio, "create_task", fake_create_task)

    created = await runtime.create_pipeline_run(
        PipelineRunCreatePayload(
            pipeline_name="CI",
            steps=[PipelineStepPayload(label="step 1", command="echo ok")],
        )
    )
    assert created["pipeline_name"] == "CI"
    assert created_coroutines

    run_open = _make_run("run_open", _make_session("session_open", PIPELINE_OPEN_TERMINAL_COMMAND))
    setattr(runtime, "_append_pipeline_line", AsyncMock())
    setattr(runtime, "_emit_run_session_status", AsyncMock())
    setattr(runtime, "_append_log", AsyncMock())
    setattr(runtime, "_emit_run_status", AsyncMock())
    setattr(runtime, "create_manual_terminal", AsyncMock(return_value={"id": "terminal_123"}))
    await execute_pipeline(run_open)
    assert run_open.status == "success"

    run_failed = _make_run("run_failed", _make_session("session_fail", "exit 1"))
    setattr(runtime, "_append_pipeline_line", AsyncMock())
    setattr(runtime, "_emit_run_session_status", AsyncMock())
    setattr(runtime, "_append_log", AsyncMock())
    setattr(runtime, "_emit_run_status", AsyncMock())
    setattr(runtime, "_execute_command", AsyncMock(return_value=5))
    await execute_pipeline(run_failed)
    assert run_failed.status == "failed"

    run_stopped = _make_run(
        "run_stopped",
        _make_session("session_pending_1", "echo 1"),
        _make_session("session_pending_2", "echo 2"),
    )
    run_stopped.stop_requested = True
    setattr(runtime, "_append_pipeline_line", AsyncMock())
    setattr(runtime, "_emit_run_session_status", AsyncMock())
    setattr(runtime, "_append_log", AsyncMock())
    setattr(runtime, "_emit_run_status", AsyncMock())
    await execute_pipeline(run_stopped)
    assert run_stopped.status == "stopped"
    assert all(session.status == "stopped" for session in run_stopped.sessions)


@pytest.mark.asyncio
async def test_runtime_stop_run_and_terminal_lifecycle(monkeypatch: pytest.MonkeyPatch) -> None:
    runtime = RuntimeManager()

    running = _make_run("run_running", _make_session("session_1", "echo 1"))
    running.current_process = cast(Any, FakeProcess(returncode=None, wait_results=[0]))
    runtime.runs[running.id] = running
    setattr(runtime, "_append_log", AsyncMock())

    spawned: list[object] = []

    def fake_create_task(coro: Any) -> object:
        spawned.append(coro)
        coro.close()
        return SimpleNamespace()

    monkeypatch.setattr(asyncio, "create_task", fake_create_task)

    stopped = await runtime.stop_pipeline_run("run_running")
    assert stopped["id"] == "run_running"
    assert running.stop_requested is True
    assert spawned

    running.status = "success"
    unchanged = await runtime.stop_pipeline_run("run_running")
    assert unchanged["status"] == "success"

    with pytest.raises(ServiceError):
        await runtime.stop_pipeline_run("missing")

    terminal = _make_terminal()
    runtime.manual_terminals[terminal.id] = terminal
    history = SimpleNamespace(
        append_manual_terminal_command=MagicMock(),
        upsert_manual_terminal=MagicMock(),
    )
    runtime.history_db = cast(Any, history)
    setattr(runtime, "_append_manual_line", AsyncMock())
    setattr(runtime, "_emit_terminal_status", AsyncMock())

    start_shell = AsyncMock()

    async def fake_start_shell(target: ManualTerminalState) -> None:
        target.current_process = cast(Any, FakeProcess(returncode=None, stdin=FakeStdin()))

    start_shell.side_effect = fake_start_shell
    setattr(runtime, "_start_manual_terminal_shell", start_shell)
    result = await runtime.run_manual_terminal_command(
        terminal.id,
        ManualTerminalCommandPayload(command="echo hello"),
    )
    assert result["status"] == "running"
    history.append_manual_terminal_command.assert_called_once()

    terminal.current_process = cast(Any, FakeProcess(returncode=None, stdin=FakeStdin(fail_drain=True)))
    with pytest.raises(ServiceError):
        await runtime.run_manual_terminal_command(
            terminal.id,
            ManualTerminalCommandPayload(command="echo broken"),
        )

    with pytest.raises(ServiceError):
        await runtime.run_manual_terminal_command(
            terminal.id,
            ManualTerminalCommandPayload(command="   "),
        )

    with pytest.raises(ServiceError):
        await runtime.run_manual_terminal_command(
            "missing",
            ManualTerminalCommandPayload(command="echo"),
        )

    stop_terminal = _make_terminal("terminal_stop")
    stop_terminal.status = "running"
    stop_terminal.current_process = cast(Any, FakeProcess(returncode=None, wait_results=[0], stdin=FakeStdin()))
    runtime.manual_terminals[stop_terminal.id] = stop_terminal
    setattr(runtime, "_append_manual_line", AsyncMock())
    setattr(runtime, "_emit_terminal_status", AsyncMock())

    async def fake_terminate(_process: Any) -> None:
        stop_terminal.current_process = None

    setattr(runtime, "_terminate_process", AsyncMock(side_effect=fake_terminate))
    stopped_terminal = await runtime.stop_manual_terminal(stop_terminal.id)
    assert stopped_terminal["status"] == "stopped"

    stop_terminal.lines = []
    cleared = await runtime.clear_manual_terminal(stop_terminal.id)
    assert cleared["lines"] == []

    with pytest.raises(ServiceError):
        await runtime.clear_manual_terminal("missing")

    setattr(runtime, "_append_log", AsyncMock())
    runtime.events.broadcast = AsyncMock()
    terminal_for_rename = _make_terminal("terminal_rename")
    runtime.manual_terminals[terminal_for_rename.id] = terminal_for_rename

    with pytest.raises(ServiceError):
        await runtime.rename_manual_terminal(
            terminal_for_rename.id,
            ManualTerminalRenamePayload(title=" "),
        )

    renamed = await runtime.rename_manual_terminal(
        terminal_for_rename.id,
        ManualTerminalRenamePayload(title="Renamed terminal"),
    )
    assert renamed["title"] == "Renamed terminal"

    with pytest.raises(ServiceError):
        await runtime.rename_manual_terminal("missing", ManualTerminalRenamePayload(title="x"))

    close_terminal = _make_terminal("terminal_close")
    close_terminal.current_process = cast(Any, FakeProcess(returncode=None, wait_results=[0], stdin=FakeStdin()))
    runtime.manual_terminals[close_terminal.id] = close_terminal
    setattr(runtime, "_persist_manual_terminal", MagicMock())
    setattr(runtime, "_terminate_process", AsyncMock())
    await runtime.close_manual_terminal(close_terminal.id)
    assert close_terminal.id not in runtime.manual_terminals

    with pytest.raises(ServiceError):
        await runtime.close_manual_terminal("missing")


@pytest.mark.asyncio
async def test_runtime_create_manual_terminal_and_misc_helpers(monkeypatch: pytest.MonkeyPatch) -> None:
    runtime = RuntimeManager()
    runtime.events.broadcast = AsyncMock()
    setattr(runtime, "_persist_manual_terminal", MagicMock())
    setattr(runtime, "_append_log", AsyncMock())
    setattr(runtime, "_append_manual_line", AsyncMock())
    setattr(runtime, "_start_manual_terminal_shell", AsyncMock())

    runtime.manual_terminals["terminal_existing"] = _make_terminal("terminal_existing")
    runtime.manual_terminals["terminal_existing"].title = "Manual terminal #1"

    created = await runtime.create_manual_terminal(ManualTerminalCreatePayload(title=None))
    assert created["title"] == "Manual terminal #2"

    is_open_terminal_command = cast(
        Callable[[str], bool],
        getattr(RuntimeManager, "_is_pipeline_open_terminal_command"),
    )
    split_completion_input = cast(
        Callable[[str], tuple[str, str]],
        getattr(RuntimeManager, "_split_completion_input"),
    )
    common_prefix = cast(
        Callable[[list[str]], str],
        getattr(RuntimeManager, "_common_prefix"),
    )
    collect_path_matches = cast(
        Callable[[Path, str], list[str]],
        getattr(RuntimeManager, "_collect_path_matches"),
    )

    assert is_open_terminal_command(PIPELINE_OPEN_TERMINAL_COMMAND)
    assert is_open_terminal_command("open_terminal")
    assert is_open_terminal_command('bash -lc "echo Terminal session started"')
    assert not is_open_terminal_command("echo hello")

    assert split_completion_input("") == ("", "")
    assert split_completion_input("ls ") == ("ls ", "")
    assert split_completion_input("ls src") == ("ls ", "src")
    assert common_prefix(["src", "script"]) == "s"

    resolve_cwd = cast(
        Callable[[ManualTerminalState], Path],
        getattr(RuntimeManager, "_resolve_terminal_cwd"),
    )
    terminal = _make_terminal("terminal_cwd")
    terminal.prompt_cwd = "~/src"
    assert resolve_cwd(terminal).name == "src"

    matches = collect_path_matches(Path("/path/does/not/exist"), "a")
    assert matches == []

    token = cast(
        Callable[[ManualTerminalState, str], Awaitable[tuple[str, str, list[str]]]],
        getattr(RuntimeManager, "_collect_completion_matches"),
    )
    terminal.prompt_cwd = "~"
    prefix, quote, completions = await token(terminal, "ls \"s")
    assert prefix == "ls "
    assert quote == '"'
    assert isinstance(completions, list)


@pytest.mark.asyncio
async def test_runtime_append_persist_and_emit_helpers() -> None:
    history_db = SimpleNamespace(
        upsert_run=MagicMock(),
        upsert_run_session=MagicMock(),
        upsert_manual_terminal=MagicMock(),
    )
    runtime = RuntimeManager(history_db=cast(Any, history_db))
    runtime.events.broadcast = AsyncMock()
    setattr(runtime, "_append_log", AsyncMock())

    terminal = _make_terminal("terminal_emit")
    append_manual_line = cast(
        Callable[[ManualTerminalState, str, str], Awaitable[None]],
        getattr(runtime, "_append_manual_line"),
    )
    await append_manual_line(terminal, "meta", "ready")
    runtime.events.broadcast.assert_awaited()

    session = _make_session("session_emit", "echo 1")
    run = _make_run("run_emit", session)

    persist_run = cast(Callable[[PipelineRunState, bool], None], getattr(runtime, "_persist_run"))
    persist_session = cast(
        Callable[[PipelineRunState, PipelineSessionState], None],
        getattr(runtime, "_persist_run_session"),
    )
    persist_terminal = cast(
        Callable[[ManualTerminalState], None],
        getattr(runtime, "_persist_manual_terminal"),
    )
    emit_run_status = cast(
        Callable[[PipelineRunState], Awaitable[None]],
        getattr(runtime, "_emit_run_status"),
    )
    emit_session_status = cast(
        Callable[[PipelineRunState, PipelineSessionState], Awaitable[None]],
        getattr(runtime, "_emit_run_session_status"),
    )
    emit_terminal_status = cast(
        Callable[[ManualTerminalState], Awaitable[None]],
        getattr(runtime, "_emit_terminal_status"),
    )

    persist_run(run, True)
    detached = _make_session("session_detached", "echo detached")
    persist_session(run, detached)
    persist_terminal(terminal)

    await emit_run_status(run)
    await emit_session_status(run, session)
    await emit_terminal_status(terminal)

    assert history_db.upsert_run.called
    assert history_db.upsert_run_session.called
    assert history_db.upsert_manual_terminal.called


@pytest.mark.asyncio
async def test_runtime_start_shell_and_additional_pipeline_branches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime = RuntimeManager()
    start_shell = cast(
        Callable[[ManualTerminalState], Awaitable[None]],
        getattr(runtime, "_start_manual_terminal_shell"),
    )
    execute_pipeline = cast(
        Callable[[PipelineRunState], Awaitable[None]],
        getattr(runtime, "_execute_pipeline_run"),
    )

    process = FakeProcess(
        returncode=None,
        wait_results=[0],
        stdin=FakeStdin(),
        stdout=FakeStream([b""]),
        stderr=FakeStream([b""]),
    )

    async def fake_create_subprocess_exec(*_args: object, **_kwargs: object) -> FakeProcess:
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)
    spawned: list[object] = []

    def fake_create_task(coro: Any) -> object:
        spawned.append(coro)
        coro.close()
        return SimpleNamespace()

    monkeypatch.setattr(asyncio, "create_task", fake_create_task)
    setattr(runtime, "_append_manual_line", AsyncMock())
    setattr(runtime, "_emit_terminal_status", AsyncMock())
    setattr(runtime, "_request_manual_prompt_probe", AsyncMock())

    terminal = _make_terminal("terminal_shell")
    await start_shell(terminal)
    assert terminal.status == "running"
    assert terminal.current_process is process
    assert len(spawned) == 3

    await start_shell(terminal)

    run_success = _make_run("run_success", _make_session("session_success", "echo ok"))
    setattr(runtime, "_append_pipeline_line", AsyncMock())
    setattr(runtime, "_emit_run_session_status", AsyncMock())
    setattr(runtime, "_append_log", AsyncMock())
    setattr(runtime, "_emit_run_status", AsyncMock())
    setattr(runtime, "_execute_command", AsyncMock(return_value=0))
    await execute_pipeline(run_success)
    assert run_success.status == "success"

    run_stop_after_command = _make_run("run_stop_after", _make_session("session_stop_after", "echo ok"))

    async def execute_and_request_stop(*_args: object, **_kwargs: object) -> int:
        run_stop_after_command.stop_requested = True
        return 0

    setattr(runtime, "_append_pipeline_line", AsyncMock())
    setattr(runtime, "_emit_run_session_status", AsyncMock())
    setattr(runtime, "_append_log", AsyncMock())
    setattr(runtime, "_emit_run_status", AsyncMock())
    setattr(runtime, "_execute_command", AsyncMock(side_effect=execute_and_request_stop))
    await execute_pipeline(run_stop_after_command)
    assert run_stop_after_command.status == "stopped"


@pytest.mark.asyncio
async def test_runtime_completion_and_idle_stop_paths() -> None:
    runtime = RuntimeManager()
    terminal = _make_terminal("terminal_complete")
    runtime.manual_terminals[terminal.id] = terminal

    setattr(
        runtime,
        "_collect_completion_matches",
        AsyncMock(return_value=("ls ", "", ["script", "scripts"])),
    )
    completion = await runtime.complete_manual_terminal_command(
        terminal.id,
        ManualTerminalAutocompletePayload(command="ls s"),
    )
    assert completion["completed_command"] == "ls script"

    idle = _make_terminal("terminal_idle")
    idle.status = "idle"
    runtime.manual_terminals[idle.id] = idle
    stopped = await runtime.stop_manual_terminal(idle.id)
    assert stopped["status"] == "idle"
