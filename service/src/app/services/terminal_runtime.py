from __future__ import annotations

import asyncio
import logging
import os
import re
import socket
from typing import Any, Awaitable, Callable, cast

from fastapi import WebSocket

from src.app.core.constants import MAX_LINES_IN_MEMORY
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
    TerminalCreatePayload,
    TerminalExecutionPayload,
)
from src.app.services.runtime import EventHub, ServiceError, TerminalLine, append_with_limit, make_id, now_iso
from src.app.services.terminal_runtime_io import (
    MARKER_PREFIX,
    should_block_local_exit,
    split_local_interactive_input,
    split_ssh_interactive_input,
)
from src.app.services.terminal_runtime_models import (
    LocalShellHandle,
    SequenceExecutionState,
    SequenceTerminalJobState,
    SshShellHandle,
    TerminalCommandState,
    TerminalLineStream,
    TerminalSessionState,
    TerminalStatus,
)
from src.app.services.terminal_shell_launcher import (
    load_paramiko,
    parse_ssh_target,
    start_local_shell,
    start_ssh_shell,
)
from src.app.services.terminal_shell_coordinator import TerminalShellCoordinator
from src.app.services.terminal_runtime_presenter import (
    build_sequence_created_event,
    build_sequence_status_event,
    build_terminal_command_status_event,
    build_terminal_created_event,
    build_terminal_deleted_event,
    build_terminal_line_event,
    build_terminal_queue_changed_event,
    build_terminal_status_event,
    serialize_command,
    serialize_line,
    serialize_sequence,
    serialize_sequence_job,
    serialize_terminal,
)
from src.app.services.terminal_runtime_shell import (
    build_local_shell_command,
    build_local_shell_env,
    build_prompt_setup_commands,
    build_shell_bootstrap_script,
    close_shell_transport,
    disable_echo,
    get_shell_pid,
    is_shell_alive,
    resize_shell,
    should_apply_local_prompt_setup,
    terminate_shell,
    wait_for_shell_exit,
)
from src.app.services.terminal_runtime_stream import TerminalStreamTransport
from src.app.services.terminal_runtime_state import (
    apply_keep_alive_terminal_result,
    begin_command_run,
    begin_sequence_job,
    finalize_sequence_after_terminal,
    finalize_sequence_completion,
    finalize_terminal_state,
    finish_command_run,
    finish_sequence_job,
    mark_sequence_running,
    mark_sequence_task_failed,
    mark_terminal_stopped,
    next_pending_command_index,
    skip_pending_commands,
)

LOGGER = logging.getLogger(__name__)
MAX_TERMINAL_SCREEN_BUFFER = 250_000

MARKER_PATTERN = re.compile(rf"^{MARKER_PREFIX}:([a-z0-9]+):(-?\d+)$")
BOOTSTRAP_PREFIX = "__OPH_SHELL_READY__"
BOOTSTRAP_PATTERN = re.compile(rf"^{BOOTSTRAP_PREFIX}:([a-z0-9]+)$")
INPUT_READY_PREFIX = "__OPH_INPUT_READY__"
INPUT_READY_PATTERN = re.compile(rf"^{INPUT_READY_PREFIX}:([a-z0-9]+)$")
LOCAL_EXIT_BLOCK_MESSAGE = "Use terminal close button instead of exit/logout"


class TerminalRuntimeManager:
    def __init__(self, events: EventHub | None = None) -> None:
        self.events = events or EventHub()
        self.terminals: dict[str, TerminalSessionState] = {}
        self.sequences: dict[str, SequenceExecutionState] = {}
        self._shells: dict[str, LocalShellHandle | SshShellHandle] = {}
        self._stream_transport = TerminalStreamTransport(max_buffer_size=MAX_TERMINAL_SCREEN_BUFFER)
        self._terminal_stream_clients = self._stream_transport.clients
        self._terminal_screen_buffers = self._stream_transport.buffers
        self._terminal_run_tasks: dict[str, asyncio.Task[Any]] = {}
        self._background_tasks: set[asyncio.Task[Any]] = set()
        self._shell_coordinator = TerminalShellCoordinator(
            terminals=self.terminals,
            shells=self._shells,
            marker_prefix=MARKER_PREFIX,
            input_ready_prefix=INPUT_READY_PREFIX,
            bootstrap_pattern=BOOTSTRAP_PATTERN,
            input_ready_pattern=INPUT_READY_PATTERN,
            marker_pattern=MARKER_PATTERN,
            get_screen_buffer=lambda terminal_id: self._stream_transport.get_buffer(terminal_id),
            start_local_shell=self._start_local_shell,
            emit_terminal_status=self._emit_terminal_status,
            append_terminal_line=self._append_terminal_line,
            broadcast_terminal_stream_text=self._broadcast_terminal_stream_text,
            is_shell_alive=self._is_shell_alive,
            get_shell_pid=self._get_shell_pid,
            write_shell_data=self._write_shell_data,
            read_shell_data=self._read_shell_data,
            build_shell_bootstrap_script=self._build_shell_bootstrap_script,
            build_prompt_setup_commands=self._build_prompt_setup_commands,
            should_apply_local_prompt_setup=self._should_apply_local_prompt_setup,
            close_shell_transport=close_shell_transport,
            terminate_shell=terminate_shell,
            wait_for_shell_exit=wait_for_shell_exit,
        )

    async def ensure_ready(self) -> None:
        return None

    @staticmethod
    def _load_paramiko() -> Any:
        return load_paramiko()

    @staticmethod
    def _parse_ssh_target(host: str) -> tuple[str, int]:
        return parse_ssh_target(host)

    def _serialize_line(self, line: TerminalLine) -> TerminalLineData:
        return serialize_line(line)

    def _serialize_command(self, command: TerminalCommandState) -> TerminalCommandData:
        return serialize_command(command)

    def _serialize_terminal(self, terminal: TerminalSessionState) -> TerminalSessionData:
        return serialize_terminal(terminal)

    def _serialize_sequence_job(self, job: SequenceTerminalJobState) -> SequenceTerminalJobData:
        return serialize_sequence_job(job)

    def _serialize_sequence(self, sequence: SequenceExecutionState) -> SequenceExecutionData:
        return serialize_sequence(sequence)

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
        await self._ensure_shell_started(terminal)
        terminal.status = "idle"
        self.terminals[terminal.id] = terminal
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
        shell_is_alive = shell is not None and self._is_shell_alive(shell)
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
        self._stream_transport.clear_buffer(terminal.id)
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

        fallback_buffer = None
        if not self._stream_transport.get_buffer(terminal_session_id) and terminal.lines and (
            not terminal.stdin_enabled or terminal.retain_completion_status
        ):
            fallback_buffer = "".join(f"{line.text}\r\n" for line in terminal.lines)
        return await self._stream_transport.connect(
            websocket,
            terminal_session_id,
            fallback_buffer=fallback_buffer,
            read_only=not terminal.stdin_enabled,
        )

    async def disconnect_terminal_stream(self, websocket: WebSocket, terminal_session_id: str) -> None:
        await self._stream_transport.disconnect(websocket, terminal_session_id)

    async def write_terminal_input(self, terminal_session_id: str, data: str) -> None:
        terminal = self.terminals.get(terminal_session_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal session not found")
        if not terminal.stdin_enabled:
            return
        shell = self._shells.get(terminal_session_id)
        if shell is None or not self._is_shell_alive(shell):
            return
        if terminal.terminal_type == "ssh" and shell.transport == "ssh":
            passthrough, should_switch = split_ssh_interactive_input(terminal, data)
            if passthrough:
                await self._write_shell_data(shell, passthrough.encode())
            if should_switch:
                await self._broadcast_terminal_stream_text(terminal.id, "\r\n")
                await self._switch_ssh_terminal_to_local_shell(terminal)
            return
        if shell.transport == "local":
            passthrough, should_block, should_refresh_prompt = split_local_interactive_input(
                terminal,
                data,
                block_local_exit=should_block_local_exit(
                    self._terminal_screen_buffers.get(terminal.id, ""),
                ),
            )
            if should_block:
                await self._write_shell_data(shell, b"\x15")
                await self._broadcast_terminal_stream_text(terminal.id, "^U\r\n")
                await self._append_terminal_line(terminal, "out", LOCAL_EXIT_BLOCK_MESSAGE)
                return
            if passthrough:
                await self._write_shell_data(shell, passthrough.encode())
            if should_refresh_prompt:
                self._create_background_task(
                    self._refresh_local_prompt_after_nested_exit(terminal.id),
                    label=f"terminal_prompt_refresh:{terminal.id}",
                )
            return
        await self._write_shell_data(shell, data.encode())

    async def resize_terminal(self, terminal_session_id: str, cols: int, rows: int) -> None:
        terminal = self.terminals.get(terminal_session_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal session not found")
        shell = self._shells.get(terminal_session_id)
        if shell is None or not self._is_shell_alive(shell):
            return
        await resize_shell(shell, cols=cols, rows=rows)

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
            ssh_password=payload.ssh_password,
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
        await self.events.broadcast("terminal_created", build_terminal_created_event(terminal))
        await self._emit_terminal_status(terminal)

    async def _emit_terminal_status(self, terminal: TerminalSessionState) -> None:
        await self.events.broadcast("terminal_status", build_terminal_status_event(terminal))
        await self._broadcast_terminal_stream_mode(terminal.id, read_only=not terminal.stdin_enabled)

    async def _emit_terminal_queue_changed(self, terminal: TerminalSessionState) -> None:
        await self.events.broadcast("terminal_queue_changed", build_terminal_queue_changed_event(terminal))

    async def _emit_command_status(self, terminal: TerminalSessionState, command: TerminalCommandState) -> None:
        await self.events.broadcast(
            "terminal_command_status",
            build_terminal_command_status_event(terminal, command),
        )
        await self._emit_terminal_queue_changed(terminal)

    async def _append_terminal_line(
        self,
        terminal: TerminalSessionState,
        stream: TerminalLineStream,
        text: str,
    ) -> None:
        line = TerminalLine(
            id=make_id("line"),
            stream=stream,
            text=text,
            created_at=now_iso(),
        )
        append_with_limit(terminal.lines, line, max_size=MAX_LINES_IN_MEMORY)
        await self.events.broadcast("terminal_line", build_terminal_line_event(terminal.id, line))
        if terminal.keep_alive:
            if stream != "out" or not terminal.stdin_enabled:
                await self._broadcast_terminal_stream_text(terminal.id, text + "\r\n")
                return
            return

        await self._broadcast_terminal_stream_text(terminal.id, text + "\r\n")

    async def _emit_terminal_deleted(self, terminal_session_id: str) -> None:
        await self.events.broadcast("terminal_deleted", build_terminal_deleted_event(terminal_session_id))

    async def _broadcast_terminal_stream_text(self, terminal_id: str, text: str) -> None:
        await self._stream_transport.broadcast_text(terminal_id, text)

    async def _broadcast_terminal_reset(self, terminal_id: str) -> None:
        await self._stream_transport.broadcast_reset(terminal_id)

    async def _broadcast_terminal_stream_mode(self, terminal_id: str, *, read_only: bool) -> None:
        await self._stream_transport.broadcast_mode(terminal_id, read_only=read_only)

    async def _emit_sequence_created(self, sequence: SequenceExecutionState) -> None:
        await self.events.broadcast("sequence_created", build_sequence_created_event(sequence))
        await self._emit_sequence_status(sequence)

    async def _emit_sequence_status(self, sequence: SequenceExecutionState) -> None:
        await self.events.broadcast("sequence_status", build_sequence_status_event(sequence))

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
        mark_sequence_task_failed(sequence, finished_at=now_iso())
        LOGGER.exception("Sequence runtime crashed: %s", sequence.id, exc_info=error)
        await self._emit_sequence_status(sequence)

    async def _run_sequence(
        self,
        sequence: SequenceExecutionState,
        terminal_payloads: list[TerminalExecutionPayload],
    ) -> None:
        mark_sequence_running(sequence, started_at=now_iso())
        await self._emit_sequence_status(sequence)

        for index, payload in enumerate(terminal_payloads):
            if sequence.stop_requested:
                break

            job = sequence.terminal_jobs[index]
            terminal = self._build_terminal_state(
                payload=payload,
                sequence_id=sequence.id,
                keep_alive=False,
                stdin_enabled=False,
                retain_completion_status=True,
            )
            begin_sequence_job(sequence, job, index=index, terminal_session_id=terminal.id)
            self.terminals[terminal.id] = terminal
            await self._emit_terminal_created(terminal)
            await self._emit_terminal_queue_changed(terminal)
            await self._emit_sequence_status(sequence)

            await self._process_terminal_queue(terminal)

            finish_sequence_job(job, terminal_status=terminal.status)
            await self._emit_sequence_status(sequence)

            if not finalize_sequence_after_terminal(
                sequence,
                terminal_status=terminal.status,
                terminal_index=index,
                finished_at=now_iso(),
            ):
                await self._emit_sequence_status(sequence)
                return

        finalize_sequence_completion(sequence, finished_at=now_iso())
        await self._emit_sequence_status(sequence)

    async def _process_terminal_queue(self, terminal: TerminalSessionState) -> None:
        if next_pending_command_index(terminal.queue) is None:
            if not terminal.keep_alive:
                await self._append_terminal_line(terminal, "meta", "[finish] terminal queue is empty")
                await self._finalize_terminal(terminal, status="success", exit_code=0)
                return

            await self._ensure_shell_started(terminal)
            await self._set_terminal_input_enabled(terminal, enabled=True)
            apply_keep_alive_terminal_result(
                terminal,
                status="success",
                exit_code=0,
                finished_at=now_iso(),
            )
            await self._emit_terminal_status(terminal)
            return

        await self._ensure_shell_started(terminal)
        if terminal.keep_alive and terminal.stdin_enabled:
            await self._set_terminal_input_enabled(terminal, enabled=False)

        result_status: TerminalStatus = "success"
        result_code = terminal.exit_code or 0

        while True:
            next_index = next_pending_command_index(terminal.queue)

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

            begin_command_run(terminal, command, index=next_index, started_at=now_iso())
            await self._append_terminal_line(terminal, "meta", f"$ {command.resolved_command}")
            await self._emit_command_status(terminal, command)
            await self._emit_terminal_status(terminal)

            return_code = await self._write_and_wait_for_command(shell, command)

            if terminal.stop_requested:
                finish_command_run(command, status="stopped", finished_at=now_iso(), exit_code=-1)
                result_status = "stopped"
                result_code = -1
                await self._append_terminal_line(terminal, "meta", "[stopped] interrupted by operator")
                await self._emit_command_status(terminal, command)
                break

            if return_code == 0:
                finish_command_run(command, status="success", finished_at=now_iso(), exit_code=return_code)
                result_status = "success"
                result_code = 0
                await self._append_terminal_line(terminal, "meta", "[finish] command completed")
                await self._emit_command_status(terminal, command)
                continue

            finish_command_run(command, status="failed", finished_at=now_iso(), exit_code=return_code)
            result_status = "failed"
            result_code = return_code
            await self._append_terminal_line(terminal, "meta", f"[finish] command failed with code {return_code}")
            await self._emit_command_status(terminal, command)
            for pending in skip_pending_commands(terminal.queue[next_index + 1 :], finished_at=now_iso()):
                await self._emit_command_status(terminal, pending)
            break

        if terminal.stop_requested:
            mark_terminal_stopped(terminal)
            await self._emit_terminal_status(terminal)
            await self._shutdown_shell(terminal.id)
            await self._finalize_terminal(terminal, status="stopped", exit_code=-1)
            return

        if terminal.keep_alive:
            await self._set_terminal_input_enabled(terminal, enabled=True)
            apply_keep_alive_terminal_result(
                terminal,
                status=result_status,
                exit_code=result_code,
                finished_at=now_iso(),
            )
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
        finalize_terminal_state(terminal, status=status, exit_code=exit_code, finished_at=now_iso())
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
            if self._is_shell_alive(shell):
                terminal.shell_pid = self._get_shell_pid(shell)
                if terminal.started_at is None:
                    terminal.started_at = now_iso()
                return

        terminal_is_published = terminal.id in self.terminals
        terminal.status = "starting"
        if terminal.started_at is None:
            terminal.started_at = now_iso()
        if terminal_is_published:
            await self._emit_terminal_status(terminal)

        shell = await (
            self._start_local_shell(terminal)
            if terminal.terminal_type == "local"
            else self._start_ssh_shell(terminal)
        )
        shell.reader_task = asyncio.create_task(self._pump_terminal_output(terminal, shell))
        try:
            await self._bootstrap_shell(terminal, shell)
        except Exception:
            await self._cleanup_failed_shell_start(shell)
            terminal.shell_pid = None
            raise
        self._shells[terminal.id] = shell
        terminal.shell_pid = self._get_shell_pid(shell)
        if terminal_is_published:
            await self._emit_terminal_status(terminal)

    async def _start_local_shell(self, terminal: TerminalSessionState) -> LocalShellHandle:
        return await start_local_shell(
            terminal,
            local_shell_handle_cls=LocalShellHandle,
            disable_echo=self._disable_echo,
            build_local_shell_command=self._build_local_shell_command,
            build_local_shell_env=self._build_local_shell_env,
        )

    async def _start_ssh_shell(self, terminal: TerminalSessionState) -> SshShellHandle:
        return await start_ssh_shell(
            terminal,
            ssh_shell_handle_cls=SshShellHandle,
            load_paramiko=self._load_paramiko,
            parse_ssh_target=self._parse_ssh_target,
        )

    @staticmethod
    def _is_shell_alive(shell: LocalShellHandle | SshShellHandle) -> bool:
        return is_shell_alive(shell)

    @staticmethod
    def _get_shell_pid(shell: LocalShellHandle | SshShellHandle) -> int | None:
        return get_shell_pid(shell)

    async def _write_shell_data(self, shell: LocalShellHandle | SshShellHandle, data: bytes) -> None:
        if isinstance(shell, LocalShellHandle):
            await asyncio.to_thread(os.write, shell.master_fd, data)
            return
        if shell.channel is None:
            raise ServiceError(status_code=500, detail="SSH shell channel is not available")
        await asyncio.to_thread(cast(Any, shell.channel.sendall), data.decode(errors="replace"))

    async def _read_shell_data(self, shell: LocalShellHandle | SshShellHandle, size: int) -> bytes:
        if isinstance(shell, LocalShellHandle):
            return await asyncio.to_thread(os.read, shell.master_fd, size)
        if shell.channel is None:
            return b""
        try:
            return await asyncio.to_thread(cast(Any, shell.channel.recv), size)
        except socket.timeout:
            return b""

    async def _resize_shell(self, shell: LocalShellHandle | SshShellHandle, *, cols: int, rows: int) -> None:
        await resize_shell(shell, cols=cols, rows=rows)

    @staticmethod
    def _build_local_shell_command(_terminal: TerminalSessionState) -> list[str]:
        return build_local_shell_command()

    @staticmethod
    def _build_local_shell_env(terminal: TerminalSessionState) -> dict[str, str]:
        return build_local_shell_env(keep_alive=terminal.keep_alive)

    @staticmethod
    def _build_prompt_setup_commands(*, interactive: bool) -> list[str]:
        return build_prompt_setup_commands(interactive=interactive)

    @staticmethod
    def _should_apply_local_prompt_setup(shell: LocalShellHandle | SshShellHandle) -> bool:
        return should_apply_local_prompt_setup(shell)

    @staticmethod
    def _build_shell_bootstrap_script(
        terminal: TerminalSessionState,
        shell: LocalShellHandle | SshShellHandle,
        token: str,
    ) -> str:
        return build_shell_bootstrap_script(
            terminal,
            shell,
            token,
            bootstrap_prefix=BOOTSTRAP_PREFIX,
        )

    @staticmethod
    def _disable_echo(fd: int) -> None:
        disable_echo(fd)

    async def _wait_for_shell_exit(self, shell: LocalShellHandle | SshShellHandle) -> None:
        await wait_for_shell_exit(shell)

    async def _close_shell_transport(self, shell: LocalShellHandle | SshShellHandle) -> None:
        await close_shell_transport(shell)

    async def _refresh_local_prompt_after_nested_exit(self, terminal_id: str) -> None:
        await self._shell_coordinator.refresh_local_prompt_after_nested_exit(terminal_id)

    def _should_block_local_exit(self, terminal: TerminalSessionState) -> bool:
        return should_block_local_exit(self._terminal_screen_buffers.get(terminal.id, ""))

    async def _switch_ssh_terminal_to_local_shell(self, terminal: TerminalSessionState) -> None:
        await self._shell_coordinator.switch_ssh_terminal_to_local_shell(terminal)

    async def _write_and_wait_for_command(
        self,
        shell: LocalShellHandle | SshShellHandle,
        command: TerminalCommandState,
    ) -> int:
        return await self._shell_coordinator.write_and_wait_for_command(shell, command)

    async def _bootstrap_shell(
        self,
        terminal: TerminalSessionState,
        shell: LocalShellHandle | SshShellHandle,
    ) -> None:
        await self._shell_coordinator.bootstrap_shell(terminal, shell)

    async def _set_terminal_input_enabled(self, terminal: TerminalSessionState, *, enabled: bool) -> None:
        await self._shell_coordinator.set_terminal_input_enabled(terminal, enabled=enabled)

    async def _pump_terminal_output(
        self,
        terminal: TerminalSessionState,
        shell: LocalShellHandle | SshShellHandle,
    ) -> None:
        await self._shell_coordinator.pump_terminal_output(terminal, shell)

    async def _handle_output_line(
        self,
        terminal: TerminalSessionState,
        shell: LocalShellHandle | SshShellHandle,
        line: str,
    ) -> None:
        await self._shell_coordinator.handle_output_line(terminal, shell, line)

    async def _cleanup_failed_shell_start(self, shell: LocalShellHandle | SshShellHandle) -> None:
        await self._shell_coordinator.cleanup_failed_shell_start(shell)

    async def _shutdown_shell(self, terminal_id: str) -> None:
        await self._shell_coordinator.shutdown_shell(terminal_id)

    async def _delete_terminal_state(self, terminal_id: str) -> None:
        terminal = self.terminals.pop(terminal_id, None)
        self._terminal_run_tasks.pop(terminal_id, None)
        self._shells.pop(terminal_id, None)
        self._stream_transport.drop_terminal(terminal_id)
        if terminal is None:
            return
        await self._emit_terminal_deleted(terminal_id)

    async def _terminate_shell(self, shell: LocalShellHandle | SshShellHandle) -> None:
        await terminate_shell(shell)
