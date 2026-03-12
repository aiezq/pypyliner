from __future__ import annotations

import asyncio
import subprocess
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal

from src.app.services.runtime import TerminalLine

TerminalStatus = Literal["idle", "starting", "running", "draining", "success", "failed", "stopped"]
CommandStatus = Literal["pending", "running", "success", "failed", "skipped", "stopped"]
SequenceStatus = Literal["pending", "running", "success", "failed", "stopped"]
SequenceJobStatus = SequenceStatus | TerminalStatus | Literal["skipped"]
TerminalLineStream = Literal["out", "err", "meta"]

if TYPE_CHECKING:
    import paramiko


def _new_terminal_lines() -> list[TerminalLine]:
    return []


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
    status: SequenceJobStatus


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
    ssh_password: str | None
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
    lines: list[TerminalLine] = field(default_factory=_new_terminal_lines)
    stop_requested: bool = False
    close_requested: bool = False
    interactive_input_buffer: str = ""


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
class ShellHandleBase:
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
    transport: Literal["local", "ssh"] = "local"


@dataclass(slots=True)
class LocalShellHandle(ShellHandleBase):
    process: subprocess.Popen[bytes] | None = None
    master_fd: int = -1
    client: None = None
    channel: None = None
    transport: Literal["local", "ssh"] = "local"


@dataclass(slots=True)
class SshShellHandle(ShellHandleBase):
    process: None = None
    master_fd: int = -1
    client: "paramiko.SSHClient | None" = None
    channel: "paramiko.Channel | None" = None
    transport: Literal["local", "ssh"] = "ssh"
