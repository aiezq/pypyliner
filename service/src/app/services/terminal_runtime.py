from __future__ import annotations

import asyncio
import fcntl
import logging
import os
import pty
import re
import signal
import struct
import subprocess
import termios
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Coroutine, Literal

from fastapi import WebSocket

from src.app.core.constants import MAX_LINES_IN_MEMORY, SHELL_EXECUTABLE
from src.app.schemas.events import (
    SequenceCreatedEventData,
    SequenceStatusEventData,
    TerminalCommandStatusEventData,
    TerminalCreatedEventData,
    TerminalDeletedEventData,
    TerminalLineEventData,
    TerminalQueueChangedEventData,
    TerminalStatusEventData,
)
from src.app.schemas.service_types import (
    SequenceExecutionData,
    SequenceTerminalJobData,
    TerminalCommandData,
    TerminalLineData,
    TerminalSessionData,
)
from src.app.schemas.terminal import (
    SequenceExecutionPayload,
    TerminalAppendCommandPayload,
    TerminalCommandPayload,
    TerminalCreatePayload,
    TerminalExecutionPayload,
)
from src.app.services.runtime import EventHub, ServiceError, TerminalLine, append_with_limit, make_id, now_iso

LOGGER = logging.getLogger(__name__)
MAX_TERMINAL_SCREEN_BUFFER = 250_000

TerminalStatus = Literal["idle", "starting", "running", "draining", "success", "failed", "stopped"]
CommandStatus = Literal["pending", "running", "success", "failed", "skipped", "stopped"]
SequenceStatus = Literal["pending", "running", "success", "failed", "stopped"]

MARKER_PREFIX = "__OPH_CMD_DONE__"
MARKER_PATTERN = re.compile(rf"^{MARKER_PREFIX}:([a-z0-9]+):(-?\d+)$")
BOOTSTRAP_PREFIX = "__OPH_SHELL_READY__"
BOOTSTRAP_PATTERN = re.compile(rf"^{BOOTSTRAP_PREFIX}:([a-z0-9]+)$")
INPUT_READY_PREFIX = "__OPH_INPUT_READY__"
INPUT_READY_PATTERN = re.compile(rf"^{INPUT_READY_PREFIX}:([a-z0-9]+)$")
ANSI_ESCAPE_PATTERN = re.compile(r"\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))")
CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
PROMPT_ONLY_PATTERN = re.compile(r"^(?:[\w.@:/~ -]+)?[%#$]\s*$")
PROMPT_PREFIX_PATTERN = re.compile(r"^[\w.@:/~ -]+[%#$>]\s+")


@dataclass(slots=True)
class TerminalCommandState:
    id: str
    node_id: str
    label: str
    original_command: str
    resolved_command: str
    status: CommandStatus
    started_at: str | None
    finished_at: str | None
    exit_code: int | None


@dataclass(slots=True)
class SequenceTerminalJobState:
    terminal_node_id: str
    terminal_session_id: str | None
    title: str
    terminal_type: str
    status: SequenceStatus | TerminalStatus


@dataclass(slots=True)
class TerminalSessionState:
    id: str
    terminal_node_id: str
    sequence_id: str | None
    title: str
    terminal_type: str
    ssh_connection_name: str | None
    ssh_host: str | None
    ssh_username: str | None
    status: TerminalStatus
    created_at: str
    started_at: str | None
    finished_at: str | None
    exit_code: int | None
    queue: list[TerminalCommandState]
    current_command_index: int | None
    current_command_id: str | None
    shell_pid: int | None
    keep_alive: bool
    stdin_enabled: bool
    retain_completion_status: bool
    lines: list[TerminalLine] = field(default_factory=list)
    stop_requested: bool = False
    close_requested: bool = False


@dataclass(slots=True)
class SequenceExecutionState:
    id: str
    sequence_node_id: str
    status: SequenceStatus
    terminal_jobs: list[SequenceTerminalJobState]
    current_terminal_index: int | None
    created_at: str
    started_at: str | None
    finished_at: str | None
    stop_requested: bool = False


@dataclass(slots=True)
class LocalShellHandle:
    process: subprocess.Popen[bytes]
    master_fd: int
    reader_task: asyncio.Task[None] | None
    current_marker_token: str | None = None
    current_marker_future: asyncio.Future[int] | None = None
    bootstrap_token: str | None = None
    bootstrap_future: asyncio.Future[None] | None = None
    bootstrapped: bool = False
    partial_output: str = ""
    raw_stream_enabled: bool = False
    input_ready_token: str | None = None
    input_ready_future: asyncio.Future[None] | None = None


class TerminalRuntimeManager:
    def __init__(self, events: EventHub | None = None) -> None:
        self.events = events or EventHub()
        self.terminals: dict[str, TerminalSessionState] = {}
        self.sequences: dict[str, SequenceExecutionState] = {}
        self._shells: dict[str, LocalShellHandle] = {}
        self._terminal_stream_clients: dict[str, set[WebSocket]] = {}
        self._terminal_screen_buffers: dict[str, str] = {}
        self._terminal_run_tasks: dict[str, asyncio.Task[Any]] = {}
        self._background_tasks: set[asyncio.Task[Any]] = set()

    async def ensure_ready(self) -> None:
        return None

    def _serialize_line(self, line: TerminalLine) -> TerminalLineData:
        return {
            "id": line.id,
            "stream": line.stream,
            "text": line.text,
            "created_at": line.created_at,
        }

    def _serialize_command(self, command: TerminalCommandState) -> TerminalCommandData:
        return {
            "id": command.id,
            "node_id": command.node_id,
            "label": command.label,
            "original_command": command.original_command,
            "resolved_command": command.resolved_command,
            "status": command.status,
            "started_at": command.started_at,
            "finished_at": command.finished_at,
            "exit_code": command.exit_code,
        }

    def _serialize_terminal(self, terminal: TerminalSessionState) -> TerminalSessionData:
        return {
            "id": terminal.id,
            "terminal_node_id": terminal.terminal_node_id,
            "sequence_id": terminal.sequence_id,
            "title": terminal.title,
            "terminal_type": terminal.terminal_type,
            "ssh_connection_name": terminal.ssh_connection_name,
            "ssh_host": terminal.ssh_host,
            "ssh_username": terminal.ssh_username,
            "status": terminal.status,
            "created_at": terminal.created_at,
            "started_at": terminal.started_at,
            "finished_at": terminal.finished_at,
            "exit_code": terminal.exit_code,
            "current_command_index": terminal.current_command_index,
            "current_command_id": terminal.current_command_id,
            "shell_pid": terminal.shell_pid,
            "stdin_enabled": terminal.stdin_enabled,
            "queue": [self._serialize_command(command) for command in terminal.queue],
            "lines": [self._serialize_line(line) for line in terminal.lines],
        }

    def _serialize_sequence_job(self, job: SequenceTerminalJobState) -> SequenceTerminalJobData:
        return {
            "terminal_node_id": job.terminal_node_id,
            "terminal_session_id": job.terminal_session_id,
            "title": job.title,
            "terminal_type": job.terminal_type,
            "status": job.status,
        }

    def _serialize_sequence(self, sequence: SequenceExecutionState) -> SequenceExecutionData:
        return {
            "id": sequence.id,
            "sequence_node_id": sequence.sequence_node_id,
            "status": sequence.status,
            "current_terminal_index": sequence.current_terminal_index,
            "created_at": sequence.created_at,
            "started_at": sequence.started_at,
            "finished_at": sequence.finished_at,
            "terminal_jobs": [self._serialize_sequence_job(job) for job in sequence.terminal_jobs],
        }

    def list_terminals(self) -> list[TerminalSessionData]:
        ordered = sorted(self.terminals.values(), key=lambda terminal: terminal.created_at, reverse=True)
        return [self._serialize_terminal(terminal) for terminal in ordered]

    def list_sequences(self) -> list[SequenceExecutionData]:
        ordered = sorted(self.sequences.values(), key=lambda sequence: sequence.created_at, reverse=True)
        return [self._serialize_sequence(sequence) for sequence in ordered]

    def get_terminal(self, terminal_session_id: str) -> TerminalSessionData:
        terminal = self.terminals.get(terminal_session_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal session not found")
        return self._serialize_terminal(terminal)

    def get_sequence(self, sequence_id: str) -> SequenceExecutionData:
        sequence = self.sequences.get(sequence_id)
        if sequence is None:
            raise ServiceError(status_code=404, detail="Sequence execution not found")
        return self._serialize_sequence(sequence)

    def snapshot(self) -> dict[str, list[TerminalSessionData] | list[SequenceExecutionData]]:
        return {
            "terminals": self.list_terminals(),
            "sequences": self.list_sequences(),
        }

    async def execute_terminal(self, payload: TerminalExecutionPayload) -> TerminalSessionData:
        if payload.terminal_type != "local":
            raise ServiceError(status_code=501, detail="SSH terminal runtime is not implemented yet")

        terminal = self._build_terminal_state(
            payload=payload,
            sequence_id=None,
            keep_alive=True,
            stdin_enabled=False,
            retain_completion_status=True,
        )
        self.terminals[terminal.id] = terminal
        await self._emit_terminal_created(terminal)
        await self._emit_terminal_queue_changed(terminal)
        self._schedule_terminal_processing(terminal)
        return self._serialize_terminal(terminal)

    async def create_terminal(self, payload: TerminalCreatePayload) -> TerminalSessionData:
        if payload.terminal_type != "local":
            raise ServiceError(status_code=501, detail="SSH terminal runtime is not implemented yet")

        terminal = self._build_terminal_state(
            payload=TerminalExecutionPayload(
                terminal_node_id=make_id("manual_terminal"),
                title=payload.title,
                terminal_type=payload.terminal_type,
                ssh_connection_name=payload.ssh_connection_name,
                ssh_host=payload.ssh_host,
                ssh_username=payload.ssh_username,
                ssh_password=payload.ssh_password,
                ssh_command=payload.ssh_command,
                commands=[],
            ),
            sequence_id=None,
            keep_alive=True,
            stdin_enabled=True,
            retain_completion_status=False,
        )
        self.terminals[terminal.id] = terminal
        await self._ensure_shell_started(terminal)
        terminal.status = "idle"
        await self._emit_terminal_created(terminal)
        await self._emit_terminal_queue_changed(terminal)
        return self._serialize_terminal(terminal)

    async def append_terminal_command(
        self,
        terminal_session_id: str,
        payload: TerminalAppendCommandPayload,
    ) -> TerminalSessionData:
        terminal = self.terminals.get(terminal_session_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal session not found")
        if terminal.status == "stopped":
            raise ServiceError(status_code=409, detail="Terminal session has been stopped")
        if terminal.terminal_type != "local":
            raise ServiceError(status_code=501, detail="SSH terminal runtime is not implemented yet")

        resolved_command = payload.command.strip()
        command = TerminalCommandState(
            id=make_id("cmd"),
            node_id=make_id("manual_cmd"),
            label=(payload.label or resolved_command.splitlines()[0][:80]).strip() or "Command",
            original_command=resolved_command,
            resolved_command=resolved_command,
            status="pending",
            started_at=None,
            finished_at=None,
            exit_code=None,
        )
        terminal.queue.append(command)
        terminal.stop_requested = False
        terminal.finished_at = None
        terminal.stdin_enabled = False
        await self._emit_terminal_queue_changed(terminal)
        await self._emit_terminal_status(terminal)
        self._schedule_terminal_processing(terminal)
        return self._serialize_terminal(terminal)

    async def execute_sequence(self, payload: SequenceExecutionPayload) -> SequenceExecutionData:
        terminal_jobs = [
            SequenceTerminalJobState(
                terminal_node_id=terminal.terminal_node_id,
                terminal_session_id=None,
                title=terminal.title,
                terminal_type=terminal.terminal_type,
                status="pending",
            )
            for terminal in payload.terminals
        ]
        sequence = SequenceExecutionState(
            id=make_id("sequence"),
            sequence_node_id=payload.sequence_node_id,
            status="pending",
            terminal_jobs=terminal_jobs,
            current_terminal_index=None,
            created_at=now_iso(),
            started_at=None,
            finished_at=None,
        )
        self.sequences[sequence.id] = sequence
        await self._emit_sequence_created(sequence)
        self._create_background_task(
            self._run_sequence(sequence, payload.terminals),
            label=f"sequence:{sequence.id}",
            on_error=lambda error, sequence=sequence: self._handle_sequence_task_error(sequence, error),
        )
        return self._serialize_sequence(sequence)

    async def stop_terminal(self, terminal_session_id: str) -> TerminalSessionData:
        terminal = self.terminals.get(terminal_session_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal session not found")
        shell = self._shells.get(terminal.id)
        shell_is_alive = shell is not None and shell.process.poll() is None
        if terminal.status in {"success", "failed", "stopped"} and not shell_is_alive:
            return self._serialize_terminal(terminal)

        terminal.stop_requested = True
        if shell is not None:
            self._create_background_task(
                self._terminate_shell(shell),
                label=f"terminal_stop:{terminal.id}",
            )

        if terminal.sequence_id is not None:
            sequence = self.sequences.get(terminal.sequence_id)
            if sequence is not None:
                sequence.stop_requested = True

        active_task = self._terminal_run_tasks.get(terminal.id)
        if active_task is None or active_task.done():
            await self._shutdown_shell(terminal.id)
            await self._finalize_terminal(terminal, status="stopped", exit_code=-1)

        return self._serialize_terminal(terminal)

    async def clear_terminal(self, terminal_session_id: str) -> TerminalSessionData:
        terminal = self.terminals.get(terminal_session_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal session not found")
        terminal.lines.clear()
        self._terminal_screen_buffers[terminal.id] = ""
        await self._broadcast_terminal_reset(terminal.id)
        await self._emit_terminal_queue_changed(terminal)
        return self._serialize_terminal(terminal)

    async def delete_terminal(self, terminal_session_id: str) -> None:
        terminal = self.terminals.get(terminal_session_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal session not found")

        terminal.close_requested = True
        active_task = self._terminal_run_tasks.get(terminal.id)
        if active_task is not None and not active_task.done():
            await self.stop_terminal(terminal.id)
            return

        await self._shutdown_shell(terminal.id)
        await self._delete_terminal_state(terminal.id)

    async def connect_terminal_stream(self, websocket: WebSocket, terminal_session_id: str) -> dict[str, Any]:
        terminal = self.terminals.get(terminal_session_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal session not found")

        await websocket.accept()
        clients = self._terminal_stream_clients.setdefault(terminal_session_id, set())
        clients.add(websocket)
        buffer = self._terminal_screen_buffers.get(terminal_session_id, "")
        if not buffer and terminal.lines and (not terminal.stdin_enabled or terminal.retain_completion_status):
            buffer = "".join(f"{line.text}\r\n" for line in terminal.lines)
            self._terminal_screen_buffers[terminal_session_id] = buffer[-MAX_TERMINAL_SCREEN_BUFFER:]
        return {
            "type": "snapshot",
            "data": {
                "buffer": self._terminal_screen_buffers.get(terminal_session_id, ""),
                "read_only": not terminal.stdin_enabled,
            },
        }

    async def disconnect_terminal_stream(self, websocket: WebSocket, terminal_session_id: str) -> None:
        clients = self._terminal_stream_clients.get(terminal_session_id)
        if not clients:
            return
        clients.discard(websocket)
        if not clients:
            self._terminal_stream_clients.pop(terminal_session_id, None)

    async def write_terminal_input(self, terminal_session_id: str, data: str) -> None:
        terminal = self.terminals.get(terminal_session_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal session not found")
        if not terminal.stdin_enabled:
            return
        shell = self._shells.get(terminal_session_id)
        if shell is None or shell.process.poll() is not None:
            return
        await asyncio.to_thread(os.write, shell.master_fd, data.encode())

    async def resize_terminal(self, terminal_session_id: str, cols: int, rows: int) -> None:
        terminal = self.terminals.get(terminal_session_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal session not found")
        shell = self._shells.get(terminal_session_id)
        if shell is None or shell.process.poll() is not None:
            return

        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        await asyncio.to_thread(fcntl.ioctl, shell.master_fd, termios.TIOCSWINSZ, winsize)
        try:
            os.kill(shell.process.pid, signal.SIGWINCH)
        except ProcessLookupError:
            return

    def _build_terminal_state(
        self,
        *,
        payload: TerminalExecutionPayload,
        sequence_id: str | None,
        keep_alive: bool,
        stdin_enabled: bool,
        retain_completion_status: bool,
    ) -> TerminalSessionState:
        commands = [
            TerminalCommandState(
                id=make_id("cmd"),
                node_id=command.node_id,
                label=command.label,
                original_command=command.original_command,
                resolved_command=command.resolved_command,
                status="pending",
                started_at=None,
                finished_at=None,
                exit_code=None,
            )
            for command in payload.commands
        ]
        return TerminalSessionState(
            id=make_id("term"),
            terminal_node_id=payload.terminal_node_id,
            sequence_id=sequence_id,
            title=payload.title,
            terminal_type=payload.terminal_type,
            ssh_connection_name=payload.ssh_connection_name,
            ssh_host=payload.ssh_host,
            ssh_username=payload.ssh_username,
            status="idle",
            created_at=now_iso(),
            started_at=None,
            finished_at=None,
            exit_code=None,
            queue=commands,
            current_command_index=None,
            current_command_id=None,
            shell_pid=None,
            keep_alive=keep_alive,
            stdin_enabled=stdin_enabled,
            retain_completion_status=retain_completion_status,
        )

    async def _emit_terminal_created(self, terminal: TerminalSessionState) -> None:
        payload: TerminalCreatedEventData = {"terminal": self._serialize_terminal(terminal)}
        await self.events.broadcast("terminal_created", payload)
        await self._emit_terminal_status(terminal)

    async def _emit_terminal_status(self, terminal: TerminalSessionState) -> None:
        payload: TerminalStatusEventData = {
            "terminal_session_id": terminal.id,
            "terminal_node_id": terminal.terminal_node_id,
            "sequence_id": terminal.sequence_id,
            "status": terminal.status,
            "current_command_index": terminal.current_command_index,
            "current_command_id": terminal.current_command_id,
            "exit_code": terminal.exit_code,
            "started_at": terminal.started_at,
            "finished_at": terminal.finished_at,
            "shell_pid": terminal.shell_pid,
            "stdin_enabled": terminal.stdin_enabled,
        }
        await self.events.broadcast("terminal_status", payload)
        await self._broadcast_terminal_stream_mode(terminal.id, read_only=not terminal.stdin_enabled)

    async def _emit_terminal_queue_changed(self, terminal: TerminalSessionState) -> None:
        payload: TerminalQueueChangedEventData = {
            "terminal_session_id": terminal.id,
            "queue": [self._serialize_command(command) for command in terminal.queue],
            "current_command_index": terminal.current_command_index,
        }
        await self.events.broadcast("terminal_queue_changed", payload)

    async def _emit_command_status(self, terminal: TerminalSessionState, command: TerminalCommandState) -> None:
        payload: TerminalCommandStatusEventData = {
            "terminal_session_id": terminal.id,
            "command": self._serialize_command(command),
            "current_command_index": terminal.current_command_index,
        }
        await self.events.broadcast("terminal_command_status", payload)
        await self._emit_terminal_queue_changed(terminal)

    async def _append_terminal_line(
        self,
        terminal: TerminalSessionState,
        stream: Literal["out", "err", "meta"],
        text: str,
    ) -> None:
        line = TerminalLine(
            id=make_id("line"),
            stream=stream,
            text=text,
            created_at=now_iso(),
        )
        append_with_limit(terminal.lines, line, max_size=MAX_LINES_IN_MEMORY)
        payload: TerminalLineEventData = {
            "terminal_session_id": terminal.id,
            "line": self._serialize_line(line),
        }
        await self.events.broadcast("terminal_line", payload)
        if terminal.keep_alive:
            if stream != "out" or not terminal.stdin_enabled:
                await self._broadcast_terminal_stream_text(terminal.id, text + "\r\n")
                return
            return

        await self._broadcast_terminal_stream_text(terminal.id, text + "\r\n")

    async def _emit_terminal_deleted(self, terminal_session_id: str) -> None:
        payload: TerminalDeletedEventData = {
            "terminal_session_id": terminal_session_id,
        }
        await self.events.broadcast("terminal_deleted", payload)

    async def _broadcast_terminal_stream_text(self, terminal_id: str, text: str) -> None:
        if not text:
            return
        buffer = self._terminal_screen_buffers.get(terminal_id, "")
        buffer = (buffer + text)[-MAX_TERMINAL_SCREEN_BUFFER:]
        self._terminal_screen_buffers[terminal_id] = buffer

        payload = {"type": "data", "data": text}
        stale_clients: list[WebSocket] = []
        for client in tuple(self._terminal_stream_clients.get(terminal_id, ())):
            try:
                await client.send_json(payload)
            except Exception:
                stale_clients.append(client)

        for client in stale_clients:
            await self.disconnect_terminal_stream(client, terminal_id)

    async def _broadcast_terminal_reset(self, terminal_id: str) -> None:
        payload = {"type": "reset"}
        stale_clients: list[WebSocket] = []
        for client in tuple(self._terminal_stream_clients.get(terminal_id, ())):
            try:
                await client.send_json(payload)
            except Exception:
                stale_clients.append(client)

        for client in stale_clients:
            await self.disconnect_terminal_stream(client, terminal_id)

    async def _broadcast_terminal_stream_mode(self, terminal_id: str, *, read_only: bool) -> None:
        payload = {"type": "mode", "data": {"read_only": read_only}}
        stale_clients: list[WebSocket] = []
        for client in tuple(self._terminal_stream_clients.get(terminal_id, ())):
            try:
                await client.send_json(payload)
            except Exception:
                stale_clients.append(client)

        for client in stale_clients:
            await self.disconnect_terminal_stream(client, terminal_id)

    async def _emit_sequence_created(self, sequence: SequenceExecutionState) -> None:
        payload: SequenceCreatedEventData = {"sequence": self._serialize_sequence(sequence)}
        await self.events.broadcast("sequence_created", payload)
        await self._emit_sequence_status(sequence)

    async def _emit_sequence_status(self, sequence: SequenceExecutionState) -> None:
        payload: SequenceStatusEventData = {
            "sequence_id": sequence.id,
            "sequence_node_id": sequence.sequence_node_id,
            "status": sequence.status,
            "current_terminal_index": sequence.current_terminal_index,
            "finished_at": sequence.finished_at,
        }
        await self.events.broadcast("sequence_status", payload)

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
            LOGGER.exception("Terminal background task failed: %s", label, exc_info=error)
            if on_error is not None:
                self._create_background_task(on_error(error), label=f"{label}:error_handler")

        task.add_done_callback(_handle_completion)
        return task

    def _create_background_task(
        self,
        coroutine: Coroutine[Any, Any, Any],
        *,
        label: str,
        on_error: Callable[[Exception], Awaitable[None]] | None = None,
    ) -> asyncio.Task[Any]:
        task = asyncio.create_task(coroutine)
        return self._track_background_task(task, label=label, on_error=on_error)

    def _schedule_terminal_processing(self, terminal: TerminalSessionState) -> None:
        active_task = self._terminal_run_tasks.get(terminal.id)
        if active_task is not None and not active_task.done():
            return

        task = self._create_background_task(
            self._process_terminal_queue(terminal),
            label=f"terminal:{terminal.id}",
            on_error=lambda error, terminal=terminal: self._handle_terminal_task_error(terminal, error),
        )
        self._terminal_run_tasks[terminal.id] = task

        def _clear_terminal_task(done_task: asyncio.Task[Any]) -> None:
            current = self._terminal_run_tasks.get(terminal.id)
            if current is done_task:
                self._terminal_run_tasks.pop(terminal.id, None)

        task.add_done_callback(_clear_terminal_task)

    async def _handle_terminal_task_error(self, terminal: TerminalSessionState, error: Exception) -> None:
        if terminal.finished_at is not None:
            return
        await self._append_terminal_line(terminal, "meta", f"[error] terminal runtime crashed: {error}")
        await self._finalize_terminal(terminal, status="failed", exit_code=-1)

    async def _handle_sequence_task_error(self, sequence: SequenceExecutionState, error: Exception) -> None:
        if sequence.finished_at is not None:
            return
        sequence.status = "failed"
        sequence.finished_at = now_iso()
        LOGGER.exception("Sequence runtime crashed: %s", sequence.id, exc_info=error)
        await self._emit_sequence_status(sequence)

    async def _run_sequence(
        self,
        sequence: SequenceExecutionState,
        terminal_payloads: list[TerminalExecutionPayload],
    ) -> None:
        sequence.status = "running"
        sequence.started_at = now_iso()
        await self._emit_sequence_status(sequence)

        for index, payload in enumerate(terminal_payloads):
            if sequence.stop_requested:
                break

            sequence.current_terminal_index = index
            job = sequence.terminal_jobs[index]
            terminal = self._build_terminal_state(
                payload=payload,
                sequence_id=sequence.id,
                keep_alive=False,
                stdin_enabled=False,
                retain_completion_status=True,
            )
            job.terminal_session_id = terminal.id
            job.status = "starting"
            self.terminals[terminal.id] = terminal
            await self._emit_terminal_created(terminal)
            await self._emit_terminal_queue_changed(terminal)
            await self._emit_sequence_status(sequence)

            await self._process_terminal_queue(terminal)

            job.status = terminal.status
            await self._emit_sequence_status(sequence)

            if terminal.status == "success":
                continue

            sequence.status = "stopped" if terminal.status == "stopped" else "failed"
            sequence.finished_at = now_iso()
            for pending_index in range(index + 1, len(sequence.terminal_jobs)):
                if sequence.terminal_jobs[pending_index].status == "pending":
                    sequence.terminal_jobs[pending_index].status = "skipped"
            await self._emit_sequence_status(sequence)
            return

        sequence.status = "stopped" if sequence.stop_requested else "success"
        sequence.finished_at = now_iso()
        await self._emit_sequence_status(sequence)

    async def _process_terminal_queue(self, terminal: TerminalSessionState) -> None:
        if terminal.terminal_type != "local":
            await self._append_terminal_line(terminal, "meta", "[error] SSH terminal runtime is not implemented yet")
            for command in terminal.queue:
                if command.status == "pending":
                    command.status = "skipped"
                    command.finished_at = now_iso()
            await self._finalize_terminal(terminal, status="failed", exit_code=-1)
            return

        if not any(command.status == "pending" for command in terminal.queue):
            if not terminal.keep_alive:
                await self._append_terminal_line(terminal, "meta", "[finish] terminal queue is empty")
                await self._finalize_terminal(terminal, status="success", exit_code=0)
                return

            await self._ensure_shell_started(terminal)
            terminal.status = "success" if terminal.retain_completion_status else "idle"
            terminal.exit_code = 0
            terminal.finished_at = now_iso() if terminal.retain_completion_status else None
            await self._set_terminal_input_enabled(terminal, enabled=True)
            await self._emit_terminal_status(terminal)
            return

        await self._ensure_shell_started(terminal)
        if terminal.keep_alive and terminal.stdin_enabled:
            await self._set_terminal_input_enabled(terminal, enabled=False)

        result_status: TerminalStatus = "success"
        result_code = terminal.exit_code or 0

        while True:
            next_index = next(
                (index for index, command in enumerate(terminal.queue) if command.status == "pending"),
                None,
            )

            if next_index is None:
                break

            if terminal.stop_requested:
                result_status = "stopped"
                result_code = -1
                break

            command = terminal.queue[next_index]
            shell = self._shells.get(terminal.id)
            if shell is None:
                raise ServiceError(status_code=500, detail="Terminal shell is not available")

            terminal.status = "running"
            terminal.current_command_index = next_index
            terminal.current_command_id = command.id
            command.status = "running"
            command.started_at = now_iso()
            await self._append_terminal_line(terminal, "meta", f"$ {command.resolved_command}")
            await self._emit_command_status(terminal, command)
            await self._emit_terminal_status(terminal)

            return_code = await self._write_and_wait_for_command(shell, command)

            command.finished_at = now_iso()
            command.exit_code = return_code

            if terminal.stop_requested:
                command.status = "stopped"
                result_status = "stopped"
                result_code = -1
                await self._append_terminal_line(terminal, "meta", "[stopped] interrupted by operator")
                await self._emit_command_status(terminal, command)
                break

            if return_code == 0:
                command.status = "success"
                result_status = "success"
                result_code = 0
                await self._append_terminal_line(terminal, "meta", "[finish] command completed")
                await self._emit_command_status(terminal, command)
                continue

            command.status = "failed"
            result_status = "failed"
            result_code = return_code
            await self._append_terminal_line(terminal, "meta", f"[finish] command failed with code {return_code}")
            await self._emit_command_status(terminal, command)
            for pending in terminal.queue[next_index + 1 :]:
                if pending.status == "pending":
                    pending.status = "skipped"
                    pending.finished_at = now_iso()
                    await self._emit_command_status(terminal, pending)
            break

        if terminal.stop_requested:
            terminal.status = "stopped"
            terminal.stdin_enabled = False
            await self._emit_terminal_status(terminal)
            await self._shutdown_shell(terminal.id)
            await self._finalize_terminal(terminal, status="stopped", exit_code=-1)
            return

        if terminal.keep_alive:
            terminal.status = result_status if terminal.retain_completion_status else "idle"
            terminal.exit_code = result_code
            terminal.current_command_index = None
            terminal.current_command_id = None
            terminal.finished_at = now_iso() if terminal.retain_completion_status else None
            await self._set_terminal_input_enabled(terminal, enabled=True)
            await self._emit_terminal_status(terminal)
            return

        terminal.status = "draining"
        await self._emit_terminal_status(terminal)
        await self._shutdown_shell(terminal.id)
        await self._finalize_terminal(terminal, status=result_status, exit_code=result_code)

    async def _finalize_terminal(
        self,
        terminal: TerminalSessionState,
        *,
        status: TerminalStatus,
        exit_code: int | None,
    ) -> None:
        terminal.status = status
        terminal.exit_code = exit_code
        terminal.current_command_index = None
        terminal.current_command_id = None
        terminal.stdin_enabled = False
        terminal.finished_at = now_iso()
        await self._emit_terminal_status(terminal)

        if terminal.sequence_id is not None:
            sequence = self.sequences.get(terminal.sequence_id)
            if sequence is not None and status == "stopped":
                sequence.stop_requested = True

        if terminal.close_requested:
            await self._delete_terminal_state(terminal.id)

    async def _ensure_shell_started(self, terminal: TerminalSessionState) -> None:
        if terminal.id in self._shells:
            shell = self._shells[terminal.id]
            if shell.process.poll() is None:
                terminal.shell_pid = shell.process.pid
                if terminal.started_at is None:
                    terminal.started_at = now_iso()
                return

        terminal.status = "starting"
        if terminal.started_at is None:
            terminal.started_at = now_iso()
        await self._emit_terminal_status(terminal)

        shell = await self._start_local_shell(terminal)
        self._shells[terminal.id] = shell
        shell.reader_task = asyncio.create_task(self._pump_terminal_output(terminal.id))
        await self._bootstrap_shell(terminal, shell)
        terminal.shell_pid = shell.process.pid
        await self._emit_terminal_status(terminal)

    async def _start_local_shell(self, terminal: TerminalSessionState) -> LocalShellHandle:
        master_fd, slave_fd = pty.openpty()
        if not terminal.keep_alive or not terminal.stdin_enabled:
            self._disable_echo(slave_fd)
        shell_command = self._build_local_shell_command(terminal)
        shell_cwd = str(Path.home())
        shell_env = {
            **os.environ,
            "TERM": "xterm-256color" if terminal.keep_alive else "dumb",
        }

        process = subprocess.Popen(
            shell_command,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            cwd=shell_cwd,
            start_new_session=True,
            close_fds=True,
            env=shell_env,
        )
        os.close(slave_fd)

        return LocalShellHandle(process=process, master_fd=master_fd, reader_task=None)

    @staticmethod
    def _build_local_shell_command(terminal: TerminalSessionState) -> list[str]:
        shell_name = os.path.basename(SHELL_EXECUTABLE)
        if shell_name == "zsh":
            return [SHELL_EXECUTABLE, "-f"]
        if shell_name == "bash":
            return [SHELL_EXECUTABLE, "--noprofile", "--norc"]
        if shell_name == "fish":
            return [SHELL_EXECUTABLE, "--no-config"]
        return [SHELL_EXECUTABLE]

    @staticmethod
    def _build_prompt_setup_commands(*, interactive: bool) -> list[str]:
        shell_name = os.path.basename(SHELL_EXECUTABLE)
        commands: list[str] = []
        if shell_name == "zsh":
            commands.extend(
                ["PROMPT='%n:%~ %# '", "RPROMPT=''", "PROMPT2='> '"]
                if interactive
                else ["PROMPT=''", "RPROMPT=''", "PROMPT2=''"]
            )
        elif shell_name == "bash":
            commands.extend(
                ["PS1='\\u:\\w\\\\$ '", "PS2='> '"] if interactive else ["PS1=''", "PS2=''"]
            )
            commands.append("bind 'set enable-bracketed-paste off' >/dev/null 2>&1 || true")
        elif shell_name == "fish":
            if interactive:
                commands.extend(
                    [
                        "function fish_prompt; echo -n (whoami)':'(prompt_pwd)'> '; end",
                        "function fish_right_prompt; end",
                    ]
                )
            else:
                commands.extend(
                    [
                        "function fish_prompt; end",
                        "function fish_right_prompt; end",
                    ]
                )
        return commands

    @classmethod
    def _build_shell_bootstrap_script(cls, terminal: TerminalSessionState, token: str) -> str:
        commands = cls._build_prompt_setup_commands(interactive=terminal.stdin_enabled)

        commands.extend(
            [
                "stty echo" if terminal.stdin_enabled else "stty -echo",
                f"printf '\\n{BOOTSTRAP_PREFIX}:{token}\\n'",
            ]
        )
        return "\n".join(commands) + "\n"

    @staticmethod
    def _disable_echo(fd: int) -> None:
        attrs = termios.tcgetattr(fd)
        attrs[3] &= ~termios.ECHO
        termios.tcsetattr(fd, termios.TCSANOW, attrs)

    async def _write_and_wait_for_command(
        self,
        shell: LocalShellHandle,
        command: TerminalCommandState,
    ) -> int:
        marker_token = make_id("marker").replace("marker_", "")
        loop = asyncio.get_running_loop()
        future: asyncio.Future[int] = loop.create_future()
        shell.current_marker_token = marker_token
        shell.current_marker_future = future

        marker_command = (
            f"{command.resolved_command}\n"
            f"printf '\\n{MARKER_PREFIX}:{marker_token}:%s\\n' \"$?\"\n"
        )
        await asyncio.to_thread(os.write, shell.master_fd, marker_command.encode())
        return await future

    async def _bootstrap_shell(self, terminal: TerminalSessionState, shell: LocalShellHandle) -> None:
        if shell.bootstrapped:
            return

        token = make_id("boot").replace("boot_", "")
        loop = asyncio.get_running_loop()
        future: asyncio.Future[None] = loop.create_future()
        shell.bootstrap_token = token
        shell.bootstrap_future = future
        bootstrap_script = self._build_shell_bootstrap_script(terminal, token)
        await asyncio.to_thread(os.write, shell.master_fd, bootstrap_script.encode())
        await future
        if terminal.keep_alive:
            shell.raw_stream_enabled = terminal.stdin_enabled
            await asyncio.to_thread(os.write, shell.master_fd, b"\n")

    async def _set_terminal_input_enabled(self, terminal: TerminalSessionState, *, enabled: bool) -> None:
        shell = self._shells.get(terminal.id)
        if shell is None or shell.process.poll() is not None or not shell.bootstrapped:
            terminal.stdin_enabled = enabled
            return

        prompt_setup = "\n".join(self._build_prompt_setup_commands(interactive=enabled))
        script = f"{prompt_setup}\n"
        if not enabled:
            terminal.stdin_enabled = False
            shell.raw_stream_enabled = False
            script += "stty -echo\n"
            await asyncio.to_thread(os.write, shell.master_fd, script.encode())
            return

        token = make_id("input").replace("input_", "")
        loop = asyncio.get_running_loop()
        future: asyncio.Future[None] = loop.create_future()
        shell.input_ready_token = token
        shell.input_ready_future = future
        shell.raw_stream_enabled = False
        script += f"stty echo\nprintf '\\n{INPUT_READY_PREFIX}:{token}\\n'\n"
        await asyncio.to_thread(os.write, shell.master_fd, script.encode())
        await future
        terminal.stdin_enabled = True
        shell.raw_stream_enabled = True
        await asyncio.to_thread(os.write, shell.master_fd, b"\n")

    async def _pump_terminal_output(self, terminal_id: str) -> None:
        terminal = self.terminals.get(terminal_id)
        if terminal is None:
            return
        shell = self._shells.get(terminal_id)
        if shell is None:
            return

        while True:
            try:
                chunk = await asyncio.to_thread(os.read, shell.master_fd, 4096)
            except OSError:
                break

            if not chunk:
                break

            decoded_chunk = chunk.decode(errors="replace")
            if shell.bootstrapped and terminal.keep_alive and shell.raw_stream_enabled:
                await self._broadcast_terminal_stream_text(terminal_id, decoded_chunk)

            shell.partial_output += decoded_chunk.replace("\r\n", "\n").replace("\r", "\n")
            while "\n" in shell.partial_output:
                raw_line, shell.partial_output = shell.partial_output.split("\n", 1)
                await self._handle_output_line(terminal, shell, raw_line)

        if shell.partial_output:
            await self._handle_output_line(terminal, shell, shell.partial_output)
            shell.partial_output = ""

        if shell.current_marker_future is not None and not shell.current_marker_future.done():
            shell.current_marker_future.set_result(-1)
            shell.current_marker_future = None
            shell.current_marker_token = None
        if shell.input_ready_future is not None and not shell.input_ready_future.done():
            shell.input_ready_future.set_exception(
                ServiceError(status_code=500, detail="Terminal shell input mode switch failed")
            )
            shell.input_ready_future = None
            shell.input_ready_token = None
        if shell.bootstrap_future is not None and not shell.bootstrap_future.done():
            shell.bootstrap_future.set_exception(
                ServiceError(status_code=500, detail="Terminal shell bootstrap failed")
            )
            shell.bootstrap_future = None
            shell.bootstrap_token = None

    async def _handle_output_line(
        self,
        terminal: TerminalSessionState,
        shell: LocalShellHandle,
        line: str,
    ) -> None:
        bootstrap_match = BOOTSTRAP_PATTERN.match(line.strip())
        if bootstrap_match and shell.bootstrap_token == bootstrap_match.group(1):
            future = shell.bootstrap_future
            shell.bootstrapped = True
            shell.bootstrap_token = None
            shell.bootstrap_future = None
            if future is not None and not future.done():
                future.set_result(None)
            return

        if not shell.bootstrapped:
            return

        marker_match = MARKER_PATTERN.match(line.strip())
        if marker_match and shell.current_marker_token == marker_match.group(1):
            future = shell.current_marker_future
            shell.current_marker_token = None
            shell.current_marker_future = None
            if future is not None and not future.done():
                future.set_result(int(marker_match.group(2)))
            return

        input_ready_match = INPUT_READY_PATTERN.match(line.strip())
        if input_ready_match and shell.input_ready_token == input_ready_match.group(1):
            future = shell.input_ready_future
            shell.input_ready_token = None
            shell.input_ready_future = None
            if future is not None and not future.done():
                future.set_result(None)
            return

        cleaned_line = self._sanitize_terminal_output_line(line)
        if cleaned_line is None:
            return
        if self._should_drop_output_line(terminal, cleaned_line):
            return
        await self._append_terminal_line(terminal, "out", cleaned_line)

    @staticmethod
    def _sanitize_terminal_output_line(line: str) -> str | None:
        without_ansi = ANSI_ESCAPE_PATTERN.sub("", line)
        without_backspaces = re.sub(r".\x08", "", without_ansi)
        normalized = CONTROL_CHAR_PATTERN.sub("", without_backspaces).strip()
        if not normalized:
            return None
        if PROMPT_ONLY_PATTERN.match(normalized):
            return None
        if normalized in {"Saving session...", "...completed."}:
            return None
        if normalized.startswith("...saving history..."):
            return None
        return normalized

    @staticmethod
    def _should_drop_output_line(terminal: TerminalSessionState, line: str) -> bool:
        if line in {'"', "e", "p", "s", "P"}:
            return True
        if line in {"stty echo", "stty -echo"}:
            return True
        if MARKER_PREFIX in line:
            return True
        if line.startswith("printf '\\n__OPH_CMD_DONE__"):
            return True
        if line.startswith(("PROMPT=", "RPROMPT=", "PROMPT2=", "PS1=", "PS2=", "bind 'set enable-bracketed-paste")):
            return True
        if line.startswith(("function fish_prompt", "function fish_right_prompt")):
            return True
        if PROMPT_PREFIX_PATTERN.match(line):
            return True
        if terminal.current_command_index is not None and 0 <= terminal.current_command_index < len(terminal.queue):
            command = terminal.queue[terminal.current_command_index]
            if line == command.resolved_command:
                return True
        return False

    async def _shutdown_shell(self, terminal_id: str) -> None:
        shell = self._shells.get(terminal_id)
        if shell is None:
            return

        try:
            if shell.process.poll() is None:
                try:
                    await asyncio.to_thread(os.write, shell.master_fd, b"exit\n")
                except OSError:
                    pass
                try:
                    await asyncio.wait_for(asyncio.to_thread(shell.process.wait), timeout=1.5)
                except asyncio.TimeoutError:
                    await self._terminate_shell(shell)
        finally:
            try:
                os.close(shell.master_fd)
            except OSError:
                pass
            try:
                if shell.reader_task is not None:
                    await shell.reader_task
            except Exception:
                LOGGER.debug("Terminal reader task ended with error", exc_info=True)
            self._shells.pop(terminal_id, None)

    async def _delete_terminal_state(self, terminal_id: str) -> None:
        terminal = self.terminals.pop(terminal_id, None)
        self._terminal_run_tasks.pop(terminal_id, None)
        self._shells.pop(terminal_id, None)
        self._terminal_screen_buffers.pop(terminal_id, None)
        self._terminal_stream_clients.pop(terminal_id, None)
        if terminal is None:
            return
        await self._emit_terminal_deleted(terminal_id)

    async def _terminate_shell(self, shell: LocalShellHandle) -> None:
        if shell.process.poll() is not None:
            return
        try:
            os.killpg(shell.process.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        try:
            await asyncio.wait_for(asyncio.to_thread(shell.process.wait), timeout=2.0)
        except asyncio.TimeoutError:
            try:
                os.killpg(shell.process.pid, signal.SIGKILL)
            except ProcessLookupError:
                return
            await asyncio.to_thread(shell.process.wait)
