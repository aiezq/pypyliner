from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, Final, Literal, TypeVar
from uuid import uuid4

from fastapi import WebSocket

from src.app.core.constants import MAX_LINES_IN_MEMORY, RUN_LOGS_DIR, SHELL_EXECUTABLE
from src.app.schemas.events import (
    RunCreatedEventData,
    RunSessionLineEventData,
    RunSessionStatusEventData,
    RunStatusEventData,
    RuntimeEventData,
    RuntimeEventMessage,
    RuntimeEventType,
    SnapshotEventMessage,
)
from src.app.schemas.pipeline import PipelineRunCreatePayload
from src.app.schemas.service_types import HistoryData, PipelineRunData, PipelineSessionData, StateSnapshotData, TerminalLineData
from src.app.services.history_db import HistoryDatabase

StreamType = Literal["out", "err", "meta"]
StatusType = Literal["idle", "pending", "running", "success", "failed", "stopped"]
RunStatusType = Literal["running", "success", "failed", "stopped"]
T = TypeVar("T")

RUN_LOGS_DIR_PATH: Final[Path] = RUN_LOGS_DIR
LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class ServiceError(Exception):
    status_code: int
    detail: str


@dataclass(slots=True)
class TerminalLine:
    id: str
    stream: StreamType
    text: str
    created_at: str


def _new_line_buffer() -> list[TerminalLine]:
    return []


@dataclass(slots=True)
class PipelineSessionState:
    id: str
    step_id: str
    title: str
    command: str
    status: StatusType
    exit_code: int | None
    lines: list[TerminalLine] = field(default_factory=_new_line_buffer)


@dataclass(slots=True)
class PipelineRunState:
    id: str
    pipeline_name: str
    status: RunStatusType
    started_at: str
    finished_at: str | None
    log_file_path: Path
    sessions: list[PipelineSessionState]
    stop_requested: bool = False
    current_process: asyncio.subprocess.Process | None = None


class EventHub:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    async def broadcast(self, event_type: RuntimeEventType, data: RuntimeEventData) -> None:
        async with self._lock:
            clients = tuple(self._clients)

        stale_clients: list[WebSocket] = []
        payload: RuntimeEventMessage = {"type": event_type, "data": data}
        for client in clients:
            try:
                await client.send_json(payload)
            except Exception:
                stale_clients.append(client)

        if stale_clients:
            async with self._lock:
                for stale in stale_clients:
                    self._clients.discard(stale)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:10]}"


def append_with_limit(items: list[T], item: T, max_size: int = MAX_LINES_IN_MEMORY) -> None:
    items.append(item)
    if len(items) > max_size:
        del items[: len(items) - max_size]


def append_text_line(path: Path, line: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as file:
        file.write(line + "\n")


class RuntimeManager:
    def __init__(self, history_db: HistoryDatabase | None = None) -> None:
        self.runs: dict[str, PipelineRunState] = {}
        self.history_db = history_db
        self.events = EventHub()
        self._log_locks: dict[Path, asyncio.Lock] = {}
        self._background_tasks: set[asyncio.Task[Any]] = set()

    async def ensure_dirs(self) -> None:
        await asyncio.to_thread(RUN_LOGS_DIR_PATH.mkdir, parents=True, exist_ok=True)

    def _serialize_line(self, line: TerminalLine) -> TerminalLineData:
        return {
            "id": line.id,
            "stream": line.stream,
            "text": line.text,
            "created_at": line.created_at,
        }

    def _serialize_session(self, session: PipelineSessionState) -> PipelineSessionData:
        return {
            "id": session.id,
            "step_id": session.step_id,
            "title": session.title,
            "command": session.command,
            "status": session.status,
            "exit_code": session.exit_code,
            "lines": [self._serialize_line(line) for line in session.lines],
        }

    def _serialize_run(self, run: PipelineRunState) -> PipelineRunData:
        return {
            "id": run.id,
            "pipeline_name": run.pipeline_name,
            "status": run.status,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "log_file_path": str(run.log_file_path),
            "sessions": [self._serialize_session(session) for session in run.sessions],
        }

    def snapshot(self) -> StateSnapshotData:
        return {
            "runs": self.list_runs(),
            "terminals": [],
            "sequences": [],
        }

    def snapshot_event(self) -> SnapshotEventMessage:
        return {"type": "snapshot", "data": self.snapshot()}

    def list_runs(self) -> list[PipelineRunData]:
        ordered = sorted(self.runs.values(), key=lambda run: run.started_at, reverse=True)
        return [self._serialize_run(run) for run in ordered]

    def history(self) -> HistoryData:
        if self.history_db is None:
            return {"runs": self.list_runs()}
        return self.history_db.fetch_history()

    def get_run(self, run_id: str) -> PipelineRunData:
        run = self.runs.get(run_id)
        if run is None:
            raise ServiceError(status_code=404, detail="Run not found")
        return self._serialize_run(run)

    def get_run_log_path(self, run_id: str) -> Path:
        run = self.runs.get(run_id)
        if run is None:
            raise ServiceError(status_code=404, detail="Run not found")
        return run.log_file_path

    async def _append_log(self, path: Path, line: str) -> None:
        lock = self._log_locks.setdefault(path, asyncio.Lock())
        async with lock:
            await asyncio.to_thread(append_text_line, path, line)

    def _persist_run(self, run: PipelineRunState, include_sessions: bool = False) -> None:
        if self.history_db is None:
            return
        self.history_db.upsert_run(
            run_id=run.id,
            pipeline_name=run.pipeline_name,
            status=run.status,
            started_at=run.started_at,
            finished_at=run.finished_at,
            log_file_path=str(run.log_file_path),
        )
        if include_sessions:
            for position, session in enumerate(run.sessions):
                self._persist_run_session(run, session, position=position)

    def _persist_run_session(
        self,
        run: PipelineRunState,
        session: PipelineSessionState,
        position: int | None = None,
    ) -> None:
        if self.history_db is None:
            return
        if position is None:
            position = run.sessions.index(session)
        self.history_db.upsert_run_session(
            session_id=session.id,
            run_id=run.id,
            step_id=session.step_id,
            position=position,
            title=session.title,
            command=session.command,
            status=session.status,
            exit_code=session.exit_code,
        )

    async def _emit_run_status(self, run: PipelineRunState) -> None:
        self._persist_run(run)
        payload: RunStatusEventData = {
            "run_id": run.id,
            "status": run.status,
            "finished_at": run.finished_at,
        }
        await self.events.broadcast("run_status", payload)

    async def _emit_run_session_status(self, run: PipelineRunState, session: PipelineSessionState) -> None:
        self._persist_run_session(run, session)
        payload: RunSessionStatusEventData = {
            "run_id": run.id,
            "session_id": session.id,
            "status": session.status,
            "exit_code": session.exit_code,
        }
        await self.events.broadcast("run_session_status", payload)

    async def _append_pipeline_line(
        self,
        run: PipelineRunState,
        session: PipelineSessionState,
        stream: StreamType,
        text: str,
    ) -> None:
        line = TerminalLine(
            id=make_id("line"),
            stream=stream,
            text=text,
            created_at=now_iso(),
        )
        append_with_limit(session.lines, line)
        await self._append_log(run.log_file_path, f"[{line.created_at}] [{session.title}] [{stream}] {text}")
        payload: RunSessionLineEventData = {
            "run_id": run.id,
            "session_id": session.id,
            "line": self._serialize_line(line),
        }
        await self.events.broadcast("run_session_line", payload)

    def _track_background_task(
        self,
        task: asyncio.Task[Any],
        *,
        label: str,
        on_error: Callable[[Exception], Awaitable[None]] | None = None,
    ) -> asyncio.Task[Any]:
        self._background_tasks.add(task)

        def _handle_completion(done_task: asyncio.Task[Any]) -> None:
            self._background_tasks.discard(done_task)
            if done_task.cancelled():
                return
            error = done_task.exception()
            if error is None:
                return
            LOGGER.exception("Background task failed: %s", label, exc_info=error)
            if on_error is not None and isinstance(error, Exception):
                self._create_background_task(on_error(error), label=f"{label}:error_handler")

        task.add_done_callback(_handle_completion)
        return task

    def _create_background_task(
        self,
        coroutine: Awaitable[Any],
        *,
        label: str,
        on_error: Callable[[Exception], Awaitable[None]] | None = None,
    ) -> asyncio.Task[Any]:
        async def _runner() -> Any:
            return await coroutine

        task = asyncio.create_task(_runner())
        return self._track_background_task(task, label=label, on_error=on_error)

    async def _terminate_process(self, process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            return
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=2.0)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()

    @staticmethod
    def _is_process_running(process: asyncio.subprocess.Process | None) -> bool:
        return process is not None and process.returncode is None

    async def _execute_command(
        self,
        command: str,
        on_line: Callable[[StreamType, str], Awaitable[None]],
        set_process: Callable[[asyncio.subprocess.Process | None], None],
    ) -> int:
        process = await asyncio.create_subprocess_shell(
            command,
            executable=SHELL_EXECUTABLE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        set_process(process)
        await on_line("meta", f"$ {command}")

        async def stream_reader(
            stream: asyncio.StreamReader | None,
            stream_name: Literal["out", "err"],
        ) -> None:
            if stream is None:
                return
            while True:
                chunk = await stream.readline()
                if not chunk:
                    break
                text = chunk.decode(errors="replace").rstrip("\n")
                if text:
                    await on_line(stream_name, text)

        stdout_task = asyncio.create_task(stream_reader(process.stdout, "out"))
        stderr_task = asyncio.create_task(stream_reader(process.stderr, "err"))

        try:
            return_code = await process.wait()
            await asyncio.gather(stdout_task, stderr_task)
            return return_code
        finally:
            set_process(None)

    async def _handle_pipeline_run_task_error(self, run: PipelineRunState, error: Exception) -> None:
        if run.finished_at is not None:
            return

        current_session = next((session for session in run.sessions if session.status == "running"), None)
        if current_session is not None:
            current_session.status = "stopped" if run.stop_requested else "failed"
            current_session.exit_code = -1
            await self._append_pipeline_line(run, current_session, "meta", f"[error] pipeline run crashed: {error}")
            await self._emit_run_session_status(run, current_session)
        else:
            await self._append_log(run.log_file_path, f"[{now_iso()}] [run] crashed: {error}")

        run.status = "stopped" if run.stop_requested else "failed"
        run.finished_at = now_iso()
        await self._emit_run_status(run)

    async def create_pipeline_run(self, payload: PipelineRunCreatePayload) -> PipelineRunData:
        run_id = make_id("run")
        started_at = now_iso()
        sessions = [
            PipelineSessionState(
                id=make_id("session"),
                step_id=make_id("step"),
                title=step.label,
                command=step.command,
                status="pending",
                exit_code=None,
            )
            for step in payload.steps
        ]
        run = PipelineRunState(
            id=run_id,
            pipeline_name=payload.pipeline_name,
            status="running",
            started_at=started_at,
            finished_at=None,
            log_file_path=RUN_LOGS_DIR_PATH / f"{run_id}.log",
            sessions=sessions,
        )
        self.runs[run.id] = run
        self._persist_run(run, include_sessions=True)
        await self._append_log(run.log_file_path, f"[{started_at}] [run] created: {run.pipeline_name}")
        event_payload: RunCreatedEventData = {"run": self._serialize_run(run)}
        await self.events.broadcast("run_created", event_payload)
        self._create_background_task(
            self._execute_pipeline_run(run),
            label=f"pipeline_run:{run.id}",
            on_error=lambda error: self._handle_pipeline_run_task_error(run, error),
        )
        return self._serialize_run(run)

    async def _execute_pipeline_run(self, run: PipelineRunState) -> None:
        run_failed = False
        for session in run.sessions:
            if run.stop_requested:
                session.status = "stopped"
                session.exit_code = -1
                await self._append_pipeline_line(run, session, "meta", "[skipped] run was stopped before this step")
                await self._emit_run_session_status(run, session)
                continue

            session.status = "running"
            session.exit_code = None
            await self._emit_run_session_status(run, session)

            return_code = await self._execute_command(
                session.command,
                on_line=lambda stream, text, run=run, session=session: self._append_pipeline_line(run, session, stream, text),
                set_process=lambda process, run=run: setattr(run, "current_process", process),
            )

            if run.stop_requested:
                session.status = "stopped"
                session.exit_code = -1
                await self._append_pipeline_line(run, session, "meta", "[stopped] interrupted by operator")
                await self._emit_run_session_status(run, session)
                break

            if return_code == 0:
                session.status = "success"
                session.exit_code = 0
                await self._append_pipeline_line(run, session, "meta", "[finish] step completed")
                await self._emit_run_session_status(run, session)
                continue

            session.status = "failed"
            session.exit_code = return_code
            run_failed = True
            await self._append_pipeline_line(run, session, "meta", f"[finish] step failed with code {return_code}")
            await self._emit_run_session_status(run, session)
            break

        if run.stop_requested:
            run.status = "stopped"
        elif run_failed:
            run.status = "failed"
        else:
            run.status = "success"

        run.finished_at = now_iso()
        await self._append_log(run.log_file_path, f"[{run.finished_at}] [run] finished with status: {run.status}")
        await self._emit_run_status(run)

    async def stop_pipeline_run(self, run_id: str) -> PipelineRunData:
        run = self.runs.get(run_id)
        if run is None:
            raise ServiceError(status_code=404, detail="Run not found")
        if run.status != "running":
            return self._serialize_run(run)

        run.stop_requested = True
        await self._append_log(run.log_file_path, f"[{now_iso()}] [run] stop requested")
        process = run.current_process
        if process is not None and self._is_process_running(process):
            self._create_background_task(
                self._terminate_process(process),
                label=f"terminate_process:{run.id}",
            )
        return self._serialize_run(run)
