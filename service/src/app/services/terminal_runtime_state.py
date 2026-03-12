from __future__ import annotations

from typing import Protocol, Sequence, TypeVar

from src.app.services.terminal_runtime_models import (
    CommandStatus,
    SequenceJobStatus,
    SequenceStatus,
    TerminalStatus,
)


class TerminalCommandLike(Protocol):
    id: str
    resolved_command: str
    status: CommandStatus
    started_at: str | None
    finished_at: str | None
    exit_code: int | None


class TerminalSessionLike(Protocol):
    status: TerminalStatus
    exit_code: int | None
    current_command_index: int | None
    current_command_id: str | None
    finished_at: str | None
    stdin_enabled: bool
    retain_completion_status: bool


class SequenceTerminalJobLike(Protocol):
    terminal_session_id: str | None
    status: SequenceJobStatus


class SequenceExecutionLike(Protocol):
    status: SequenceStatus
    current_terminal_index: int | None
    started_at: str | None
    finished_at: str | None
    stop_requested: bool

    @property
    def terminal_jobs(self) -> Sequence[SequenceTerminalJobLike]: ...


TerminalCommandT = TypeVar("TerminalCommandT", bound=TerminalCommandLike)


def next_pending_command_index(queue: Sequence[TerminalCommandLike]) -> int | None:
    return next((index for index, command in enumerate(queue) if command.status == "pending"), None)


def begin_command_run(
    terminal: TerminalSessionLike,
    command: TerminalCommandLike,
    *,
    index: int,
    started_at: str,
) -> None:
    terminal.status = "running"
    terminal.current_command_index = index
    terminal.current_command_id = command.id
    command.status = "running"
    command.started_at = started_at


def finish_command_run(
    command: TerminalCommandLike,
    *,
    status: CommandStatus,
    finished_at: str,
    exit_code: int,
) -> None:
    command.status = status
    command.finished_at = finished_at
    command.exit_code = exit_code


def skip_pending_commands(commands: Sequence[TerminalCommandT], *, finished_at: str) -> list[TerminalCommandT]:
    skipped: list[TerminalCommandT] = []
    for command in commands:
        if command.status != "pending":
            continue
        command.status = "skipped"
        command.finished_at = finished_at
        skipped.append(command)
    return skipped


def apply_keep_alive_terminal_result(
    terminal: TerminalSessionLike,
    *,
    status: TerminalStatus,
    exit_code: int,
    finished_at: str,
) -> None:
    terminal.status = status if terminal.retain_completion_status else "idle"
    terminal.exit_code = exit_code
    terminal.current_command_index = None
    terminal.current_command_id = None
    terminal.finished_at = finished_at if terminal.retain_completion_status else None


def mark_terminal_stopped(terminal: TerminalSessionLike) -> None:
    terminal.status = "stopped"
    terminal.stdin_enabled = False


def finalize_terminal_state(
    terminal: TerminalSessionLike,
    *,
    status: TerminalStatus,
    exit_code: int | None,
    finished_at: str,
) -> None:
    terminal.status = status
    terminal.exit_code = exit_code
    terminal.current_command_index = None
    terminal.current_command_id = None
    terminal.stdin_enabled = False
    terminal.finished_at = finished_at


def mark_sequence_running(sequence: SequenceExecutionLike, *, started_at: str) -> None:
    sequence.status = "running"
    sequence.started_at = started_at


def begin_sequence_job(
    sequence: SequenceExecutionLike,
    job: SequenceTerminalJobLike,
    *,
    index: int,
    terminal_session_id: str,
) -> None:
    sequence.current_terminal_index = index
    job.terminal_session_id = terminal_session_id
    job.status = "starting"


def finish_sequence_job(job: SequenceTerminalJobLike, *, terminal_status: TerminalStatus) -> None:
    job.status = terminal_status


def finalize_sequence_after_terminal(
    sequence: SequenceExecutionLike,
    *,
    terminal_status: TerminalStatus,
    terminal_index: int,
    finished_at: str,
) -> bool:
    if terminal_status == "success":
        return True

    sequence.status = "stopped" if terminal_status == "stopped" else "failed"
    sequence.finished_at = finished_at
    for pending_job in sequence.terminal_jobs[terminal_index + 1 :]:
        if pending_job.status == "pending":
            pending_job.status = "skipped"
    return False


def finalize_sequence_completion(sequence: SequenceExecutionLike, *, finished_at: str) -> None:
    sequence.status = "stopped" if sequence.stop_requested else "success"
    sequence.finished_at = finished_at


def mark_sequence_task_failed(sequence: SequenceExecutionLike, *, finished_at: str) -> None:
    sequence.status = "failed"
    sequence.finished_at = finished_at
