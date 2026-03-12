from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

from src.app.services.runtime import ServiceError, make_id
from src.app.services.terminal_runtime_io import (
    sanitize_terminal_output_line,
    should_block_local_exit,
    should_drop_output_line,
)

if TYPE_CHECKING:
    from src.app.services.terminal_runtime_models import (
        LocalShellHandle,
        SshShellHandle,
        TerminalCommandState,
        TerminalLineStream,
        TerminalSessionState,
    )

LOGGER = logging.getLogger(__name__)


class TerminalShellCoordinator:
    def __init__(
        self,
        *,
        terminals: dict[str, TerminalSessionState],
        shells: dict[str, LocalShellHandle | SshShellHandle],
        marker_prefix: str,
        input_ready_prefix: str,
        bootstrap_pattern: Any,
        input_ready_pattern: Any,
        marker_pattern: Any,
        get_screen_buffer: Callable[[str], str],
        start_local_shell: Callable[[TerminalSessionState], Awaitable[LocalShellHandle]],
        emit_terminal_status: Callable[[TerminalSessionState], Awaitable[None]],
        append_terminal_line: Callable[[TerminalSessionState, TerminalLineStream, str], Awaitable[None]],
        broadcast_terminal_stream_text: Callable[[str, str], Awaitable[None]],
        is_shell_alive: Callable[[LocalShellHandle | SshShellHandle], bool],
        get_shell_pid: Callable[[LocalShellHandle | SshShellHandle], int | None],
        write_shell_data: Callable[[LocalShellHandle | SshShellHandle, bytes], Awaitable[None]],
        read_shell_data: Callable[[LocalShellHandle | SshShellHandle, int], Awaitable[bytes]],
        build_shell_bootstrap_script: Callable[[TerminalSessionState, LocalShellHandle | SshShellHandle, str], str],
        build_prompt_setup_commands: Callable[..., list[str]],
        should_apply_local_prompt_setup: Callable[[LocalShellHandle | SshShellHandle], bool],
        close_shell_transport: Callable[[LocalShellHandle | SshShellHandle], Awaitable[None]],
        terminate_shell: Callable[[LocalShellHandle | SshShellHandle], Awaitable[None]],
        wait_for_shell_exit: Callable[[LocalShellHandle | SshShellHandle], Awaitable[None]],
    ) -> None:
        self.terminals = terminals
        self.shells = shells
        self.marker_prefix = marker_prefix
        self.input_ready_prefix = input_ready_prefix
        self.bootstrap_pattern = bootstrap_pattern
        self.input_ready_pattern = input_ready_pattern
        self.marker_pattern = marker_pattern
        self.get_screen_buffer = get_screen_buffer
        self.start_local_shell = start_local_shell
        self.emit_terminal_status = emit_terminal_status
        self.append_terminal_line = append_terminal_line
        self.broadcast_terminal_stream_text = broadcast_terminal_stream_text
        self.is_shell_alive = is_shell_alive
        self.get_shell_pid = get_shell_pid
        self.write_shell_data = write_shell_data
        self.read_shell_data = read_shell_data
        self.build_shell_bootstrap_script = build_shell_bootstrap_script
        self.build_prompt_setup_commands = build_prompt_setup_commands
        self.should_apply_local_prompt_setup = should_apply_local_prompt_setup
        self.close_shell_transport = close_shell_transport
        self.terminate_shell = terminate_shell
        self.wait_for_shell_exit = wait_for_shell_exit

    async def refresh_local_prompt_after_nested_exit(self, terminal_id: str) -> None:
        await asyncio.sleep(0.25)
        terminal = self.terminals.get(terminal_id)
        shell = self.shells.get(terminal_id)
        if terminal is None or shell is None:
            return
        if shell.transport != "local" or not terminal.stdin_enabled or not self.is_shell_alive(shell):
            return
        if should_block_local_exit(self.get_screen_buffer(terminal.id)):
            return
        await self.set_terminal_input_enabled(terminal, enabled=True)

    async def switch_ssh_terminal_to_local_shell(self, terminal: TerminalSessionState) -> None:
        shell = self.shells.get(terminal.id)
        if shell is not None:
            await self.close_shell_transport(shell)
            try:
                if shell.reader_task is not None:
                    await shell.reader_task
            except Exception:
                LOGGER.debug("SSH reader task ended with error during local shell switch", exc_info=True)
            self.shells.pop(terminal.id, None)

        terminal.interactive_input_buffer = ""
        terminal.stdin_enabled = True
        terminal.shell_pid = None

        local_shell = await self.start_local_shell(terminal)
        self.shells[terminal.id] = local_shell
        local_shell.reader_task = asyncio.create_task(self.pump_terminal_output(terminal, local_shell))
        await self.bootstrap_shell(terminal, local_shell)
        terminal.shell_pid = self.get_shell_pid(local_shell)
        await self.emit_terminal_status(terminal)

    async def write_and_wait_for_command(
        self,
        shell: LocalShellHandle | SshShellHandle,
        command: TerminalCommandState,
    ) -> int:
        marker_token = make_id("marker").replace("marker_", "")
        loop = asyncio.get_running_loop()
        future: asyncio.Future[int] = loop.create_future()
        shell.current_marker_token = marker_token
        shell.current_marker_future = future

        marker_command = (
            f"{command.resolved_command}\n"
            f"printf '\\n{self.marker_prefix}:{marker_token}:%s\\n' \"$?\"\n"
        )
        await self.write_shell_data(shell, marker_command.encode())
        return await future

    async def bootstrap_shell(
        self,
        terminal: TerminalSessionState,
        shell: LocalShellHandle | SshShellHandle,
    ) -> None:
        if shell.bootstrapped:
            return

        token = make_id("boot").replace("boot_", "")
        loop = asyncio.get_running_loop()
        future: asyncio.Future[None] = loop.create_future()
        shell.bootstrap_token = token
        shell.bootstrap_future = future
        bootstrap_script = self.build_shell_bootstrap_script(terminal, shell, token)
        await self.write_shell_data(shell, bootstrap_script.encode())
        await future
        if terminal.keep_alive:
            shell.raw_stream_enabled = terminal.stdin_enabled
            await self.write_shell_data(shell, b"\n")

    async def set_terminal_input_enabled(self, terminal: TerminalSessionState, *, enabled: bool) -> None:
        shell = self.shells.get(terminal.id)
        if shell is None or not self.is_shell_alive(shell) or not shell.bootstrapped:
            terminal.stdin_enabled = enabled
            return

        prompt_setup = (
            "\n".join(self.build_prompt_setup_commands(interactive=enabled))
            if self.should_apply_local_prompt_setup(shell)
            else ""
        )
        script = f"{prompt_setup}\n" if prompt_setup else ""
        if not enabled:
            terminal.stdin_enabled = False
            shell.raw_stream_enabled = False
            script += "stty -echo 2>/dev/null || true\n"
            await self.write_shell_data(shell, script.encode())
            return

        token = make_id("input").replace("input_", "")
        loop = asyncio.get_running_loop()
        future: asyncio.Future[None] = loop.create_future()
        shell.input_ready_token = token
        shell.input_ready_future = future
        shell.raw_stream_enabled = False
        script += f"stty echo 2>/dev/null || true\nprintf '\\n{self.input_ready_prefix}:{token}\\n'\n"
        await self.write_shell_data(shell, script.encode())
        await future
        terminal.stdin_enabled = True
        shell.raw_stream_enabled = True
        await self.write_shell_data(shell, b"\n")

    async def pump_terminal_output(
        self,
        terminal: TerminalSessionState,
        shell: LocalShellHandle | SshShellHandle,
    ) -> None:
        terminal_id = terminal.id
        while True:
            try:
                chunk = await self.read_shell_data(shell, 4096)
            except Exception:
                break

            if not chunk:
                if not self.is_shell_alive(shell):
                    break
                await asyncio.sleep(0.05)
                continue

            decoded_chunk = chunk.decode(errors="replace")
            if shell.bootstrapped and terminal.keep_alive and shell.raw_stream_enabled:
                await self.broadcast_terminal_stream_text(terminal_id, decoded_chunk)

            shell.partial_output += decoded_chunk.replace("\r\n", "\n").replace("\r", "\n")
            while "\n" in shell.partial_output:
                raw_line, shell.partial_output = shell.partial_output.split("\n", 1)
                await self.handle_output_line(terminal, shell, raw_line)

        if shell.partial_output:
            await self.handle_output_line(terminal, shell, shell.partial_output)
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

    async def handle_output_line(
        self,
        terminal: TerminalSessionState,
        shell: LocalShellHandle | SshShellHandle,
        line: str,
    ) -> None:
        bootstrap_match = self.bootstrap_pattern.match(line.strip())
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

        marker_match = self.marker_pattern.match(line.strip())
        if marker_match and shell.current_marker_token == marker_match.group(1):
            future = shell.current_marker_future
            shell.current_marker_token = None
            shell.current_marker_future = None
            if future is not None and not future.done():
                future.set_result(int(marker_match.group(2)))
            return

        input_ready_match = self.input_ready_pattern.match(line.strip())
        if input_ready_match and shell.input_ready_token == input_ready_match.group(1):
            future = shell.input_ready_future
            shell.input_ready_token = None
            shell.input_ready_future = None
            if future is not None and not future.done():
                future.set_result(None)
            return

        cleaned_line = sanitize_terminal_output_line(line)
        if cleaned_line is None:
            return
        current_command_resolved_command = None
        if terminal.current_command_index is not None and 0 <= terminal.current_command_index < len(terminal.queue):
            current_command_resolved_command = terminal.queue[terminal.current_command_index].resolved_command
        if should_drop_output_line(
            cleaned_line,
            current_command_resolved_command=current_command_resolved_command,
        ):
            return
        await self.append_terminal_line(terminal, "out", cleaned_line)

    async def cleanup_failed_shell_start(self, shell: LocalShellHandle | SshShellHandle) -> None:
        try:
            if self.is_shell_alive(shell):
                await self.terminate_shell(shell)
        finally:
            try:
                await self.close_shell_transport(shell)
            finally:
                try:
                    if shell.reader_task is not None:
                        await shell.reader_task
                except Exception:
                    LOGGER.debug("Terminal reader task ended with error after startup failure", exc_info=True)

    async def shutdown_shell(self, terminal_id: str) -> None:
        shell = self.shells.get(terminal_id)
        if shell is None:
            return

        try:
            if self.is_shell_alive(shell):
                try:
                    await self.write_shell_data(shell, b"exit\n")
                except (OSError, ServiceError):
                    pass
                try:
                    await asyncio.wait_for(self.wait_for_shell_exit(shell), timeout=1.5)
                except asyncio.TimeoutError:
                    await self.terminate_shell(shell)
        finally:
            await self.close_shell_transport(shell)
            try:
                if shell.reader_task is not None:
                    await shell.reader_task
            except Exception:
                LOGGER.debug("Terminal reader task ended with error", exc_info=True)
            self.shells.pop(terminal_id, None)
