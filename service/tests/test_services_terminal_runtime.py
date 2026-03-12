from __future__ import annotations

import asyncio
import getpass
import os
import queue
import re
import shlex
import socket
import time
from pathlib import Path

import pytest

from src.app.schemas.terminal import (
    SequenceExecutionPayload,
    TerminalAppendCommandPayload,
    TerminalCommandPayload,
    TerminalCreatePayload,
    TerminalExecutionPayload,
)
from src.app.services.runtime import ServiceError
from src.app.services.terminal_runtime import (
    BOOTSTRAP_PREFIX,
    INPUT_READY_PREFIX,
    LOCAL_EXIT_BLOCK_MESSAGE,
    LocalShellHandle,
    MARKER_PREFIX,
    TerminalRuntimeManager,
)


class RecordingEventHub:
    def __init__(self) -> None:
        self.events: list[tuple[str, object]] = []

    async def broadcast(self, event_type: str, data: object) -> None:
        self.events.append((event_type, data))


class FakeSshChannel:
    def __init__(self) -> None:
        self.closed = False
        self._chunks: queue.Queue[bytes] = queue.Queue()
        self.cwd = str(Path.home())
        self.width = 120
        self.height = 40

    def settimeout(self, _timeout: float) -> None:
        return None

    def sendall(self, data: str) -> None:
        if self.closed:
            return

        bootstrap_match = re.search(rf"{BOOTSTRAP_PREFIX}:([a-z0-9]+)", data)
        if bootstrap_match:
            self._chunks.put(f"{BOOTSTRAP_PREFIX}:{bootstrap_match.group(1)}\n".encode())
            return

        input_ready_match = re.search(rf"{INPUT_READY_PREFIX}:([a-z0-9]+)", data)
        if input_ready_match:
            self._chunks.put(f"{INPUT_READY_PREFIX}:{input_ready_match.group(1)}\n".encode())
            return

        marker_match = re.search(rf"{MARKER_PREFIX}:([a-z0-9]+):%s", data)
        if marker_match:
            command = data.split("\n", 1)[0].strip()
            output, exit_code = self._run_command(command)
            payload = "".join(f"{line}\n" for line in output)
            payload += f"{MARKER_PREFIX}:{marker_match.group(1)}:{exit_code}\n"
            self._chunks.put(payload.encode())
            return

        for command in [line.strip() for line in data.splitlines() if line.strip()]:
            output, _ = self._run_command(command)
            if output:
                self._chunks.put("".join(f"{line}\n" for line in output).encode())

    def recv(self, _size: int) -> bytes:
        if self.closed:
            return b""
        try:
            return self._chunks.get(timeout=0.2)
        except queue.Empty as error:
            raise socket.timeout() from error

    def resize_pty(self, width: int, height: int) -> None:
        self.width = width
        self.height = height

    def close(self) -> None:
        self.closed = True
        self._chunks.put(b"")

    def _run_command(self, command: str) -> tuple[list[str], int]:
        if command in {"stty echo 2>/dev/null || true", "stty -echo 2>/dev/null || true"}:
            return [], 0
        if command.startswith("cd "):
            self.cwd = command[3:].strip()
            return [], 0
        if command == "pwd":
            return [self.cwd], 0
        if command.startswith("echo "):
            parts = shlex.split(command)
            return [" ".join(parts[1:])], 0
        if command.startswith("sleep "):
            try:
                delay = float(command.split(" ", 1)[1].strip())
            except ValueError:
                delay = 0
            time.sleep(min(delay, 0.05))
            return [], 0
        if command == "false":
            return [], 1
        return [command], 0


class FakeSshClient:
    def __init__(self) -> None:
        self.closed = False
        self.channel = FakeSshChannel()
        self.connection_args: dict[str, object] = {}

    def set_missing_host_key_policy(self, _policy: object) -> None:
        return None

    def connect(self, **kwargs: object) -> None:
        self.connection_args = kwargs

    def invoke_shell(self, *, term: str, width: int, height: int) -> FakeSshChannel:
        self.channel.width = width
        self.channel.height = height
        self.connection_args["term"] = term
        return self.channel

    def close(self) -> None:
        self.closed = True
        self.channel.close()


class FakeParamikoModule:
    class SSHException(Exception):
        pass

    class AuthenticationException(SSHException):
        pass

    class BadHostKeyException(SSHException):
        pass

    class AutoAddPolicy:
        pass

    def __init__(self) -> None:
        self.clients: list[FakeSshClient] = []

    def SSHClient(self) -> FakeSshClient:
        client = FakeSshClient()
        self.clients.append(client)
        return client


def test_local_shell_bootstrap_for_switched_ssh_terminal_uses_local_prompt_setup(
    monkeypatch: pytest.MonkeyPatch,
):
    runtime = TerminalRuntimeManager()
    payload = TerminalExecutionPayload(
        terminal_node_id="node_ssh_prompt",
        title="SSH Prompt Terminal",
        terminal_type="ssh",
        ssh_host="example.com",
        ssh_username="operator",
        ssh_password="secret",
        commands=[],
    )
    terminal = runtime._build_terminal_state(
        payload=payload,
        sequence_id=None,
        keep_alive=True,
        stdin_enabled=True,
        retain_completion_status=True,
    )
    monkeypatch.setenv("VIRTUAL_ENV", str(Path("/tmp/fake-venv")))
    monkeypatch.setenv("PATH", f"/tmp/fake-venv/bin{os.pathsep}/usr/bin")

    shell_env = runtime._build_local_shell_env(terminal)
    bootstrap_script = runtime._build_shell_bootstrap_script(terminal, LocalShellHandle(reader_task=None), "token")

    assert shell_env.get("VIRTUAL_ENV") is None
    assert shell_env["VIRTUAL_ENV_DISABLE_PROMPT"] == "1"
    assert "/tmp/fake-venv/bin" not in shell_env["PATH"]
    assert any(command in bootstrap_script for command in runtime._build_prompt_setup_commands(interactive=True))


def test_local_exit_blocking_depends_on_top_level_prompt():
    runtime = TerminalRuntimeManager()
    terminal = runtime._build_terminal_state(
        payload=TerminalExecutionPayload(
            terminal_node_id="node_local_prompt",
            title="Local Prompt Terminal",
            terminal_type="local",
            commands=[],
        ),
        sequence_id=None,
        keep_alive=True,
        stdin_enabled=True,
        retain_completion_status=False,
    )

    runtime._terminal_screen_buffers[terminal.id] = "aiezq:~ % "
    assert runtime._should_block_local_exit(terminal) is True

    runtime._terminal_screen_buffers[terminal.id] = "/ # "
    assert runtime._should_block_local_exit(terminal) is False


async def _wait_for_terminal(
    runtime: TerminalRuntimeManager,
    terminal_id: str,
    *,
    timeout: float = 5.0,
):
    async def _poll():
        while True:
            terminal = runtime.get_terminal(terminal_id)
            if terminal["status"] in {"success", "failed", "stopped"}:
                return terminal
            await asyncio.sleep(0.05)

    return await asyncio.wait_for(_poll(), timeout=timeout)


async def _wait_for_sequence(
    runtime: TerminalRuntimeManager,
    sequence_id: str,
    *,
    timeout: float = 5.0,
):
    async def _poll():
        while True:
            sequence = runtime.get_sequence(sequence_id)
            if sequence["status"] in {"success", "failed", "stopped"}:
                return sequence
            await asyncio.sleep(0.05)

    return await asyncio.wait_for(_poll(), timeout=timeout)


@pytest.mark.asyncio
async def test_create_terminal_cleans_up_shell_on_startup_failure(monkeypatch: pytest.MonkeyPatch):
    runtime = TerminalRuntimeManager()
    started_pids: list[int] = []
    original_start_local_shell = runtime._start_local_shell

    async def track_local_shell_start(*args, **kwargs):
        shell = await original_start_local_shell(*args, **kwargs)
        assert shell.process is not None
        started_pids.append(shell.process.pid)
        return shell

    async def fail_bootstrap(*_args, **_kwargs):
        raise ServiceError(status_code=500, detail="shell bootstrap failed")

    monkeypatch.setattr(runtime, "_start_local_shell", track_local_shell_start)
    monkeypatch.setattr(runtime, "_bootstrap_shell", fail_bootstrap)

    with pytest.raises(ServiceError) as error_info:
        await runtime.create_terminal(
            TerminalCreatePayload(
                title="Broken terminal",
                terminal_type="local",
            )
        )

    assert error_info.value.detail == "shell bootstrap failed"
    assert runtime.terminals == {}
    assert runtime._shells == {}
    assert started_pids
    for pid in started_pids:
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)


@pytest.mark.asyncio
async def test_execute_terminal_reuses_single_shell_state(tmp_path: Path):
    runtime = TerminalRuntimeManager()
    payload = TerminalExecutionPayload(
        terminal_node_id="node_terminal_1",
        title="Test Terminal",
        terminal_type="local",
        commands=[
            TerminalCommandPayload(
                node_id="node_cmd_1",
                label="Change directory",
                original_command=f"cd {tmp_path}",
                resolved_command=f"cd {tmp_path}",
            ),
            TerminalCommandPayload(
                node_id="node_cmd_2",
                label="Print working directory",
                original_command="pwd",
                resolved_command="pwd",
            ),
        ],
    )

    terminal = await runtime.execute_terminal(payload)
    completed = await _wait_for_terminal(runtime, terminal["id"])

    assert completed["status"] == "success"
    assert completed["stdin_enabled"] is True
    assert completed["shell_pid"] is not None
    assert [item["status"] for item in completed["queue"]] == ["success", "success"]
    assert any(line["text"] == str(tmp_path) for line in completed["lines"])

    await runtime.write_terminal_input(terminal["id"], 'echo "native shell"\n')
    with_native_input = await _wait_for_terminal_output(runtime, terminal["id"], "native shell")
    assert any(line["text"] == "native shell" for line in with_native_input["lines"])

    stopped = await runtime.stop_terminal(terminal["id"])
    assert stopped["status"] == "stopped"


@pytest.mark.asyncio
async def test_execute_sequence_runs_terminals_in_order(tmp_path: Path):
    runtime = TerminalRuntimeManager()
    marker_file = tmp_path / "sequence_marker.txt"
    payload = SequenceExecutionPayload(
        sequence_node_id="node_sequence_1",
        terminals=[
            TerminalExecutionPayload(
                terminal_node_id="node_terminal_1",
                title="Prepare",
                terminal_type="local",
                commands=[
                    TerminalCommandPayload(
                        node_id="node_cmd_1",
                        label="Create marker",
                        original_command=f"printf 'ready' > {marker_file}",
                        resolved_command=f"printf 'ready' > {marker_file}",
                    )
                ],
            ),
            TerminalExecutionPayload(
                terminal_node_id="node_terminal_2",
                title="Verify",
                terminal_type="local",
                commands=[
                    TerminalCommandPayload(
                        node_id="node_cmd_2",
                        label="Read marker",
                        original_command=f"test -f {marker_file} && cat {marker_file}",
                        resolved_command=f"test -f {marker_file} && cat {marker_file}",
                    )
                ],
            ),
        ],
    )

    sequence = await runtime.execute_sequence(payload)
    completed_sequence = await _wait_for_sequence(runtime, sequence["id"])

    assert completed_sequence["status"] == "success"
    assert marker_file.read_text(encoding="utf-8") == "ready"

    terminals = runtime.list_terminals()
    assert len(terminals) == 2
    assert {terminal["terminal_node_id"] for terminal in terminals} == {
        "node_terminal_1",
        "node_terminal_2",
    }
    assert all(terminal["status"] == "success" for terminal in terminals)


@pytest.mark.asyncio
async def test_manual_terminal_keeps_shell_state_across_appended_commands(tmp_path: Path):
    runtime = TerminalRuntimeManager()
    terminal = await runtime.create_terminal(TerminalCreatePayload(title="Manual Terminal"))

    await runtime.append_terminal_command(
        terminal["id"],
        TerminalAppendCommandPayload(command=f"cd {tmp_path}"),
    )
    await _wait_for_terminal_idle(runtime, terminal["id"])

    await runtime.append_terminal_command(
        terminal["id"],
        TerminalAppendCommandPayload(command="pwd"),
    )
    completed = await _wait_for_terminal_idle(runtime, terminal["id"])

    assert completed["status"] == "idle"
    assert completed["finished_at"] is None
    assert completed["shell_pid"] is not None
    assert any(line["text"] == str(tmp_path) for line in completed["lines"])

    stopped = await runtime.stop_terminal(terminal["id"])
    assert stopped["status"] == "stopped"


@pytest.mark.asyncio
async def test_manual_terminal_starts_in_user_home_directory():
    runtime = TerminalRuntimeManager()
    terminal = await runtime.create_terminal(TerminalCreatePayload(title="Home Terminal"))

    await runtime.write_terminal_input(terminal["id"], "pwd\n")
    completed = await _wait_for_terminal_output(runtime, terminal["id"], str(Path.home()))

    assert any(line["text"] == str(Path.home()) for line in completed["lines"])

    stopped = await runtime.stop_terminal(terminal["id"])
    assert stopped["status"] == "stopped"


@pytest.mark.asyncio
async def test_manual_local_terminal_blocks_exit_and_keeps_shell_alive():
    runtime = TerminalRuntimeManager()
    terminal = await runtime.create_terminal(TerminalCreatePayload(title="Guarded Terminal"))

    await runtime.write_terminal_input(terminal["id"], "exit\n")
    with_block_message = await _wait_for_terminal_output(runtime, terminal["id"], LOCAL_EXIT_BLOCK_MESSAGE)
    assert any(line["text"] == LOCAL_EXIT_BLOCK_MESSAGE for line in with_block_message["lines"])

    await runtime.write_terminal_input(terminal["id"], 'echo "still here"\n')
    with_follow_up = await _wait_for_terminal_output(runtime, terminal["id"], "still here")
    assert any(line["text"] == "still here" for line in with_follow_up["lines"])
    assert runtime.get_terminal(terminal["id"])["status"] == "idle"
    assert runtime.get_terminal(terminal["id"])["shell_pid"] is not None

    stopped = await runtime.stop_terminal(terminal["id"])
    assert stopped["status"] == "stopped"


@pytest.mark.asyncio
async def test_local_nested_shell_exit_restores_host_prompt():
    runtime = TerminalRuntimeManager()
    terminal = await runtime.create_terminal(TerminalCreatePayload(title="Nested Prompt Terminal"))

    await runtime.write_terminal_input(terminal["id"], "sh\n")
    await _wait_for_screen_buffer_text(runtime, terminal["id"], "sh-")

    await runtime.write_terminal_input(terminal["id"], "exit\n")
    await _wait_for_screen_buffer_text(runtime, terminal["id"], f"{getpass.getuser()}:~ % ")

    stopped = await runtime.stop_terminal(terminal["id"])
    assert stopped["status"] == "stopped"


@pytest.mark.asyncio
async def test_execute_ssh_terminal_reuses_single_remote_shell_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    runtime = TerminalRuntimeManager()
    fake_paramiko = FakeParamikoModule()
    monkeypatch.setattr(runtime, "_load_paramiko", lambda: fake_paramiko)

    payload = TerminalExecutionPayload(
        terminal_node_id="node_ssh_terminal_1",
        title="SSH Terminal",
        terminal_type="ssh",
        ssh_host="example.com:2222",
        ssh_username="operator",
        ssh_password="secret",
        commands=[
            TerminalCommandPayload(
                node_id="node_cmd_1",
                label="Change directory",
                original_command=f"cd {tmp_path}",
                resolved_command=f"cd {tmp_path}",
            ),
            TerminalCommandPayload(
                node_id="node_cmd_2",
                label="Print working directory",
                original_command="pwd",
                resolved_command="pwd",
            ),
        ],
    )

    terminal = await runtime.execute_terminal(payload)
    completed = await _wait_for_terminal(runtime, terminal["id"])

    assert completed["status"] == "success"
    assert completed["stdin_enabled"] is True
    assert completed["shell_pid"] is None
    assert [item["status"] for item in completed["queue"]] == ["success", "success"]
    assert any(line["text"] == str(tmp_path) for line in completed["lines"])

    client = fake_paramiko.clients[0]
    assert client.connection_args["hostname"] == "example.com"
    assert client.connection_args["port"] == 2222
    assert client.connection_args["username"] == "operator"
    assert client.connection_args["password"] == "secret"
    assert client.connection_args["term"] == "xterm-256color"

    await runtime.write_terminal_input(terminal["id"], 'echo "native ssh"\n')
    with_native_input = await _wait_for_terminal_output(runtime, terminal["id"], "native ssh")
    assert any(line["text"] == "native ssh" for line in with_native_input["lines"])

    stopped = await runtime.stop_terminal(terminal["id"])
    assert stopped["status"] == "stopped"


@pytest.mark.asyncio
async def test_create_ssh_terminal_requires_host_and_username(monkeypatch: pytest.MonkeyPatch):
    runtime = TerminalRuntimeManager()
    monkeypatch.setattr(runtime, "_load_paramiko", lambda: FakeParamikoModule())

    with pytest.raises(ServiceError) as error_info:
        await runtime.create_terminal(
            TerminalCreatePayload(
                title="SSH Manual Terminal",
                terminal_type="ssh",
                ssh_host="",
                ssh_username="",
            )
        )

    assert error_info.value.status_code == 400
    assert error_info.value.detail == "SSH host and username are required"


@pytest.mark.asyncio
async def test_ssh_terminal_exit_switches_back_to_local_shell(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    runtime = TerminalRuntimeManager()
    monkeypatch.setattr(runtime, "_load_paramiko", lambda: FakeParamikoModule())

    terminal = await runtime.execute_terminal(
        TerminalExecutionPayload(
            terminal_node_id="node_ssh_terminal_exit",
            title="SSH Terminal Exit",
            terminal_type="ssh",
            ssh_host="example.com",
            ssh_username="operator",
            ssh_password="secret",
            commands=[
                TerminalCommandPayload(
                    node_id="node_cmd_1",
                    label="Change remote directory",
                    original_command=f"cd {tmp_path}",
                    resolved_command=f"cd {tmp_path}",
                ),
            ],
        )
    )
    completed = await _wait_for_terminal(runtime, terminal["id"])

    assert completed["stdin_enabled"] is True
    assert runtime._shells[terminal["id"]].transport == "ssh"

    await runtime.write_terminal_input(terminal["id"], "exit\n")
    await _wait_for_shell_transport(runtime, terminal["id"], "local")

    after_switch = runtime.get_terminal(terminal["id"])
    assert after_switch["stdin_enabled"] is True
    assert after_switch["shell_pid"] is not None

    await runtime.write_terminal_input(terminal["id"], "pwd\n")
    with_local_input = await _wait_for_terminal_output(runtime, terminal["id"], str(Path.home()))

    assert any(line["text"] == str(Path.home()) for line in with_local_input["lines"])
    assert not any(line["text"] == str(tmp_path) for line in with_local_input["lines"][-3:])

    stopped = await runtime.stop_terminal(terminal["id"])
    assert stopped["status"] == "stopped"


@pytest.mark.asyncio
async def test_execute_terminal_filters_shell_noise_and_preserves_output_order():
    runtime = TerminalRuntimeManager()
    payload = TerminalExecutionPayload(
        terminal_node_id="node_terminal_clean",
        title="Clean Output Terminal",
        terminal_type="local",
        commands=[
            TerminalCommandPayload(
                node_id="node_cmd_1",
                label="First",
                original_command='echo "Первое сообщение"',
                resolved_command='echo "Первое сообщение"',
            ),
            TerminalCommandPayload(
                node_id="node_cmd_2",
                label="Pause",
                original_command="sleep 0.2",
                resolved_command="sleep 0.2",
            ),
            TerminalCommandPayload(
                node_id="node_cmd_3",
                label="Second",
                original_command='echo "Второе сообщение"',
                resolved_command='echo "Второе сообщение"',
            ),
        ],
    )

    terminal = await runtime.execute_terminal(payload)
    completed = await _wait_for_terminal(runtime, terminal["id"])

    visible_output_lines = [line["text"] for line in completed["lines"] if line["stream"] == "out"]
    assert visible_output_lines == ["Первое сообщение", "Второе сообщение"]
    assert not any(MARKER_PREFIX in line for line in visible_output_lines)
    assert not any("\x1b" in line for line in visible_output_lines)

    stopped = await runtime.stop_terminal(terminal["id"])
    assert stopped["status"] == "stopped"


async def _wait_for_terminal_idle(
    runtime: TerminalRuntimeManager,
    terminal_id: str,
    *,
    timeout: float = 5.0,
):
    async def _poll():
        while True:
            terminal = runtime.get_terminal(terminal_id)
            if terminal["status"] == "idle" and terminal["shell_pid"] is not None:
                pending = [command for command in terminal["queue"] if command["status"] == "pending"]
                running = [command for command in terminal["queue"] if command["status"] == "running"]
                if not pending and not running:
                    return terminal
            await asyncio.sleep(0.05)

    return await asyncio.wait_for(_poll(), timeout=timeout)


async def _wait_for_terminal_deleted(
    runtime: TerminalRuntimeManager,
    terminal_id: str,
    *,
    timeout: float = 5.0,
):
    async def _poll():
        while True:
            try:
                runtime.get_terminal(terminal_id)
            except Exception:
                return
            await asyncio.sleep(0.05)

    return await asyncio.wait_for(_poll(), timeout=timeout)


async def _wait_for_terminal_output(
    runtime: TerminalRuntimeManager,
    terminal_id: str,
    expected_text: str,
    *,
    timeout: float = 5.0,
):
    async def _poll():
        while True:
            terminal = runtime.get_terminal(terminal_id)
            if any(line["text"] == expected_text for line in terminal["lines"]):
                return terminal
            await asyncio.sleep(0.05)

    return await asyncio.wait_for(_poll(), timeout=timeout)


async def _wait_for_shell_transport(
    runtime: TerminalRuntimeManager,
    terminal_id: str,
    transport: str,
    *,
    timeout: float = 5.0,
):
    async def _poll():
        while True:
            shell = runtime._shells.get(terminal_id)
            if shell is not None and shell.transport == transport:
                return shell
            await asyncio.sleep(0.05)

    return await asyncio.wait_for(_poll(), timeout=timeout)


async def _wait_for_screen_buffer_text(
    runtime: TerminalRuntimeManager,
    terminal_id: str,
    expected_text: str,
    *,
    timeout: float = 5.0,
):
    async def _poll():
        while True:
            buffer = runtime._terminal_screen_buffers.get(terminal_id, "")
            if expected_text in buffer:
                return buffer
            await asyncio.sleep(0.05)

    return await asyncio.wait_for(_poll(), timeout=timeout)


@pytest.mark.asyncio
async def test_delete_manual_terminal_removes_session_after_stop_request():
    runtime = TerminalRuntimeManager()
    terminal = await runtime.create_terminal(TerminalCreatePayload(title="Closable Terminal"))

    await runtime.append_terminal_command(
        terminal["id"],
        TerminalAppendCommandPayload(command="sleep 1"),
    )
    await asyncio.sleep(0.1)

    await runtime.delete_terminal(terminal["id"])
    await _wait_for_terminal_deleted(runtime, terminal["id"])

    with pytest.raises(ServiceError) as error_info:
        runtime.get_terminal(terminal["id"])
    assert error_info.value.status_code == 404
    assert error_info.value.detail == "Terminal session not found"


@pytest.mark.asyncio
async def test_connect_terminal_stream_rehydrates_buffer_from_lines():
    runtime = TerminalRuntimeManager()
    payload = TerminalExecutionPayload(
        terminal_node_id="node_terminal_snapshot",
        title="Snapshot Terminal",
        terminal_type="local",
        commands=[
            TerminalCommandPayload(
                node_id="node_cmd_1",
                label="Echo",
                original_command='echo "snapshot-output"',
                resolved_command='echo "snapshot-output"',
            ),
        ],
    )

    terminal = await runtime.execute_terminal(payload)
    completed = await _wait_for_terminal(runtime, terminal["id"])
    runtime._terminal_screen_buffers[completed["id"]] = ""

    class FakeWebSocket:
        async def accept(self) -> None:
            return None

    snapshot = await runtime.connect_terminal_stream(FakeWebSocket(), completed["id"])

    assert snapshot["type"] == "snapshot"
    assert "snapshot-output" in snapshot["data"]["buffer"]

    stopped = await runtime.stop_terminal(terminal["id"])
    assert stopped["status"] == "stopped"


@pytest.mark.asyncio
async def test_connect_terminal_stream_for_graph_terminal_uses_full_line_buffer():
    runtime = TerminalRuntimeManager()
    payload = TerminalExecutionPayload(
        terminal_node_id="node_terminal_ordered_stream",
        title="Ordered Stream Terminal",
        terminal_type="local",
        commands=[
            TerminalCommandPayload(
                node_id="node_cmd_1",
                label="First",
                original_command='echo "Первое сообщение"',
                resolved_command='echo "Первое сообщение"',
            ),
            TerminalCommandPayload(
                node_id="node_cmd_2",
                label="Sleep",
                original_command="sleep 0.1",
                resolved_command="sleep 0.1",
            ),
            TerminalCommandPayload(
                node_id="node_cmd_3",
                label="Second",
                original_command='echo "Второе сообщение"',
                resolved_command='echo "Второе сообщение"',
            ),
        ],
    )

    terminal = await runtime.execute_terminal(payload)
    completed = await _wait_for_terminal(runtime, terminal["id"])

    class FakeWebSocket:
        async def accept(self) -> None:
            return None

    snapshot = await runtime.connect_terminal_stream(FakeWebSocket(), completed["id"])
    buffer = snapshot["data"]["buffer"]

    assert '$ echo "Первое сообщение"' in buffer
    assert '$ sleep 0.1' in buffer
    assert '$ echo "Второе сообщение"' in buffer
    assert buffer.index('$ echo "Первое сообщение"') < buffer.index('$ sleep 0.1')
    assert buffer.index('$ sleep 0.1') < buffer.index('$ echo "Второе сообщение"')

    stopped = await runtime.stop_terminal(terminal["id"])
    assert stopped["status"] == "stopped"


@pytest.mark.asyncio
async def test_graph_terminal_stream_unlocks_existing_client_after_queue_completion():
    runtime = TerminalRuntimeManager()
    payload = TerminalExecutionPayload(
        terminal_node_id="node_terminal_unlock_stream",
        title="Unlock Stream Terminal",
        terminal_type="local",
        commands=[
            TerminalCommandPayload(
                node_id="node_cmd_1",
                label="Sleep",
                original_command="sleep 0.2",
                resolved_command="sleep 0.2",
            ),
        ],
    )

    class FakeWebSocket:
        def __init__(self) -> None:
            self.sent_payloads: list[dict[str, object]] = []

        async def accept(self) -> None:
            return None

        async def send_json(self, payload: dict[str, object]) -> None:
            self.sent_payloads.append(payload)

    terminal = await runtime.execute_terminal(payload)
    client = FakeWebSocket()
    snapshot = await runtime.connect_terminal_stream(client, terminal["id"])
    completed = await _wait_for_terminal(runtime, terminal["id"])

    assert snapshot["type"] == "snapshot"
    assert snapshot["data"]["read_only"] is True
    assert completed["stdin_enabled"] is True
    assert any(
        payload.get("type") == "mode" and payload.get("data", {}).get("read_only") is False
        for payload in client.sent_payloads
    )
    joined_data = "\n".join(
        str(payload.get("data"))
        for payload in client.sent_payloads
        if payload.get("type") == "data"
    )
    assert "PROMPT=" not in joined_data
    assert "RPROMPT=" not in joined_data
    assert "PROMPT2=" not in joined_data
    assert "stty echo" not in joined_data

    stopped = await runtime.stop_terminal(terminal["id"])
    assert stopped["status"] == "stopped"


@pytest.mark.asyncio
async def test_execute_sequence_broadcasts_sequence_events():
    events = RecordingEventHub()
    runtime = TerminalRuntimeManager(events=events)  # type: ignore[arg-type]
    response = await runtime.execute_sequence(
        SequenceExecutionPayload(
            sequence_node_id="node_sequence_1",
            terminals=[
                TerminalExecutionPayload(
                    terminal_node_id="node_terminal_1",
                    title="Sequence Terminal",
                    terminal_type="local",
                    commands=[
                        TerminalCommandPayload(
                            node_id="node_cmd_1",
                            label="Echo",
                            original_command="echo sequence",
                            resolved_command="echo sequence",
                        )
                    ],
                )
            ],
        )
    )

    sequence = await _wait_for_sequence(runtime, response["id"])

    event_types = [event_type for event_type, _payload in events.events]
    assert "sequence_created" in event_types
    assert "sequence_status" in event_types
    assert sequence["status"] == "success"
