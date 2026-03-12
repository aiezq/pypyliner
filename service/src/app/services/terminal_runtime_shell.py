from __future__ import annotations

import asyncio
import fcntl
import os
import signal
import struct
import termios
from pathlib import Path

from src.app.core.constants import SHELL_EXECUTABLE
from src.app.services.terminal_runtime_models import LocalShellHandle, SshShellHandle, TerminalSessionState

ShellHandle = LocalShellHandle | SshShellHandle


def is_shell_alive(shell: ShellHandle) -> bool:
    if isinstance(shell, LocalShellHandle):
        return shell.process is not None and shell.process.poll() is None
    return shell.channel is not None and not shell.channel.closed


def get_shell_pid(shell: ShellHandle) -> int | None:
    if isinstance(shell, LocalShellHandle):
        return shell.process.pid if shell.process is not None else None
    return None


async def resize_shell(shell: ShellHandle, *, cols: int, rows: int) -> None:
    if isinstance(shell, LocalShellHandle):
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        await asyncio.to_thread(fcntl.ioctl, shell.master_fd, termios.TIOCSWINSZ, winsize)
        try:
            if shell.process is not None:
                os.kill(shell.process.pid, signal.SIGWINCH)
        except ProcessLookupError:
            return
        return

    if shell.channel is None:
        return
    await asyncio.to_thread(shell.channel.resize_pty, width=cols, height=rows)


def build_local_shell_command() -> list[str]:
    shell_name = os.path.basename(SHELL_EXECUTABLE)
    if shell_name == "zsh":
        return [SHELL_EXECUTABLE, "-f"]
    if shell_name == "bash":
        return [SHELL_EXECUTABLE, "--noprofile", "--norc"]
    if shell_name == "fish":
        return [SHELL_EXECUTABLE, "--no-config"]
    return [SHELL_EXECUTABLE]


def build_local_shell_env(*, keep_alive: bool) -> dict[str, str]:
    shell_env = dict(os.environ)
    shell_env["TERM"] = "xterm-256color" if keep_alive else "dumb"
    shell_env["VIRTUAL_ENV_DISABLE_PROMPT"] = "1"
    venv_path = shell_env.pop("VIRTUAL_ENV", None)
    shell_env.pop("PYTHONHOME", None)

    if venv_path:
        venv_bin = str(Path(venv_path) / ("Scripts" if os.name == "nt" else "bin"))
        path_entries = shell_env.get("PATH", "").split(os.pathsep)
        shell_env["PATH"] = os.pathsep.join(
            entry for entry in path_entries if entry and Path(entry).resolve() != Path(venv_bin).resolve()
        )

    return shell_env


def build_prompt_setup_commands(*, interactive: bool) -> list[str]:
    shell_name = os.path.basename(SHELL_EXECUTABLE)
    commands: list[str] = []
    if shell_name == "zsh":
        commands.extend(
            ["PROMPT='%n:%~ %# '", "RPROMPT=''", "PROMPT2='> '"]
            if interactive
            else ["PROMPT=''", "RPROMPT=''", "PROMPT2=''"]
        )
    elif shell_name == "bash":
        commands.extend(["PS1='\\u:\\w\\\\$ '", "PS2='> '"] if interactive else ["PS1=''", "PS2=''"])
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


def should_apply_local_prompt_setup(shell: ShellHandle) -> bool:
    return isinstance(shell, LocalShellHandle)


def build_shell_bootstrap_script(
    terminal: TerminalSessionState,
    shell: ShellHandle,
    token: str,
    *,
    bootstrap_prefix: str,
) -> str:
    commands = build_prompt_setup_commands(interactive=terminal.stdin_enabled) if should_apply_local_prompt_setup(shell) else []
    commands.extend(
        [
            "stty echo 2>/dev/null || true" if terminal.stdin_enabled else "stty -echo 2>/dev/null || true",
            f"printf '\\n{bootstrap_prefix}:{token}\\n'",
        ]
    )
    return "\n".join(commands) + "\n"


def disable_echo(fd: int) -> None:
    attrs = termios.tcgetattr(fd)
    attrs[3] &= ~termios.ECHO
    termios.tcsetattr(fd, termios.TCSANOW, attrs)


async def wait_for_shell_exit(shell: ShellHandle) -> None:
    if isinstance(shell, LocalShellHandle):
        if shell.process is not None:
            await asyncio.to_thread(shell.process.wait)
        return

    if shell.channel is None:
        return
    while is_shell_alive(shell):
        await asyncio.sleep(0.05)


async def close_shell_transport(shell: ShellHandle) -> None:
    if isinstance(shell, LocalShellHandle):
        try:
            os.close(shell.master_fd)
        except OSError:
            pass
        return

    if shell.channel is not None:
        await asyncio.to_thread(shell.channel.close)
    if shell.client is not None:
        await asyncio.to_thread(shell.client.close)


async def terminate_shell(shell: ShellHandle) -> None:
    if isinstance(shell, LocalShellHandle):
        if shell.process is None or shell.process.poll() is not None:
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
        return

    await close_shell_transport(shell)
