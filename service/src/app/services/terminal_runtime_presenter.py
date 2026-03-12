from __future__ import annotations

from typing import TYPE_CHECKING

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

if TYPE_CHECKING:
    from src.app.services.runtime import TerminalLine
    from src.app.services.terminal_runtime_models import (
        SequenceExecutionState,
        SequenceTerminalJobState,
        TerminalCommandState,
        TerminalSessionState,
    )


def serialize_line(line: TerminalLine) -> TerminalLineData:
    return {
        "id": line.id,
        "stream": line.stream,
        "text": line.text,
        "created_at": line.created_at,
    }


def serialize_command(command: TerminalCommandState) -> TerminalCommandData:
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


def serialize_terminal(terminal: TerminalSessionState) -> TerminalSessionData:
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
        "queue": [serialize_command(command) for command in terminal.queue],
        "lines": [serialize_line(line) for line in terminal.lines],
    }


def serialize_sequence_job(job: SequenceTerminalJobState) -> SequenceTerminalJobData:
    return {
        "terminal_node_id": job.terminal_node_id,
        "terminal_session_id": job.terminal_session_id,
        "title": job.title,
        "terminal_type": job.terminal_type,
        "status": job.status,
    }


def serialize_sequence(sequence: SequenceExecutionState) -> SequenceExecutionData:
    return {
        "id": sequence.id,
        "sequence_node_id": sequence.sequence_node_id,
        "status": sequence.status,
        "current_terminal_index": sequence.current_terminal_index,
        "created_at": sequence.created_at,
        "started_at": sequence.started_at,
        "finished_at": sequence.finished_at,
        "terminal_jobs": [serialize_sequence_job(job) for job in sequence.terminal_jobs],
    }


def build_terminal_created_event(terminal: TerminalSessionState) -> TerminalCreatedEventData:
    return {"terminal": serialize_terminal(terminal)}


def build_terminal_status_event(terminal: TerminalSessionState) -> TerminalStatusEventData:
    return {
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


def build_terminal_queue_changed_event(terminal: TerminalSessionState) -> TerminalQueueChangedEventData:
    return {
        "terminal_session_id": terminal.id,
        "queue": [serialize_command(command) for command in terminal.queue],
        "current_command_index": terminal.current_command_index,
    }


def build_terminal_command_status_event(
    terminal: TerminalSessionState,
    command: TerminalCommandState,
) -> TerminalCommandStatusEventData:
    return {
        "terminal_session_id": terminal.id,
        "command": serialize_command(command),
        "current_command_index": terminal.current_command_index,
    }


def build_terminal_line_event(terminal_id: str, line: TerminalLine) -> TerminalLineEventData:
    return {
        "terminal_session_id": terminal_id,
        "line": serialize_line(line),
    }


def build_terminal_deleted_event(terminal_session_id: str) -> TerminalDeletedEventData:
    return {
        "terminal_session_id": terminal_session_id,
    }


def build_sequence_created_event(sequence: SequenceExecutionState) -> SequenceCreatedEventData:
    return {"sequence": serialize_sequence(sequence)}


def build_sequence_status_event(sequence: SequenceExecutionState) -> SequenceStatusEventData:
    return {
        "sequence_id": sequence.id,
        "sequence_node_id": sequence.sequence_node_id,
        "status": sequence.status,
        "current_terminal_index": sequence.current_terminal_index,
        "finished_at": sequence.finished_at,
    }
