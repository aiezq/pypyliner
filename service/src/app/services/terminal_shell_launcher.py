from __future__ import annotations

import asyncio
import importlib
import os
import pty
import socket
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

from src.app.services.runtime import ServiceError

if TYPE_CHECKING:
    from src.app.services.terminal_runtime_models import (
        LocalShellHandle,
        SshShellHandle,
        TerminalSessionState,
    )


def load_paramiko() -> Any:
    try:
        return importlib.import_module("paramiko")
    except ModuleNotFoundError as error:
        raise ServiceError(
            status_code=503,
            detail="SSH runtime dependency 'paramiko' is not installed",
        ) from error


def parse_ssh_target(host: str) -> tuple[str, int]:
    trimmed = host.strip()
    if not trimmed:
        raise ServiceError(status_code=400, detail="SSH host is required")
    if trimmed.startswith("[") and "]:" in trimmed:
        hostname, _, port_raw = trimmed[1:].partition("]:")
        return hostname, int(port_raw)
    if trimmed.count(":") == 1:
        hostname, _, port_raw = trimmed.partition(":")
        if port_raw.isdigit():
            return hostname, int(port_raw)
    return trimmed, 22


async def start_local_shell(
    terminal: TerminalSessionState,
    *,
    local_shell_handle_cls: type[LocalShellHandle],
    disable_echo: Callable[[int], None],
    build_local_shell_command: Callable[[TerminalSessionState], list[str]],
    build_local_shell_env: Callable[[TerminalSessionState], dict[str, str]],
) -> LocalShellHandle:
    master_fd, slave_fd = pty.openpty()
    if not terminal.keep_alive or not terminal.stdin_enabled:
        disable_echo(slave_fd)
    shell_command = build_local_shell_command(terminal)
    shell_cwd = str(Path.home())
    shell_env = build_local_shell_env(terminal)

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
    return local_shell_handle_cls(process=process, master_fd=master_fd, reader_task=None)


async def start_ssh_shell(
    terminal: TerminalSessionState,
    *,
    ssh_shell_handle_cls: type[SshShellHandle],
    load_paramiko: Callable[[], Any],
    parse_ssh_target: Callable[[str], tuple[str, int]],
) -> SshShellHandle:
    if not terminal.ssh_host or not terminal.ssh_username:
        raise ServiceError(status_code=400, detail="SSH host and username are required")

    try:
        hostname, port = parse_ssh_target(terminal.ssh_host)
    except ValueError as error:
        raise ServiceError(status_code=400, detail=f"Invalid SSH target: {terminal.ssh_host}") from error

    paramiko = load_paramiko()
    term_type = "xterm-256color" if terminal.keep_alive else "dumb"

    def _connect() -> tuple[Any, Any]:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=hostname,
            port=port,
            username=terminal.ssh_username,
            password=terminal.ssh_password or None,
            look_for_keys=not bool(terminal.ssh_password),
            allow_agent=not bool(terminal.ssh_password),
            timeout=10,
            banner_timeout=10,
            auth_timeout=10,
        )
        channel = client.invoke_shell(term=term_type, width=120, height=40)
        channel.settimeout(1.0)
        return client, channel

    try:
        client, channel = await asyncio.to_thread(_connect)
    except (paramiko.AuthenticationException, paramiko.BadHostKeyException) as error:
        raise ServiceError(status_code=401, detail=f"SSH authentication failed: {error}") from error
    except (paramiko.SSHException, socket.timeout, TimeoutError, OSError) as error:
        raise ServiceError(status_code=502, detail=f"SSH connection failed: {error}") from error

    return ssh_shell_handle_cls(client=client, channel=channel, reader_task=None)
