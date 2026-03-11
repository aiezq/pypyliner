from __future__ import annotations

import asyncio
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
from src.app.services.terminal_runtime import MARKER_PREFIX, TerminalRuntimeManager


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
