from __future__ import annotations

from typing import cast

import pytest
from fastapi import WebSocket
from fastapi import WebSocketDisconnect

from src.app.api.routes.events import events_socket
from src.app.schemas.events import SnapshotEventMessage
from src.app.services.runtime import RuntimeManager


class FakeEventsHub:
    def __init__(self) -> None:
        self.connected = False
        self.disconnected = False

    async def connect(self, _websocket: object) -> None:
        self.connected = True

    async def disconnect(self, _websocket: object) -> None:
        self.disconnected = True


class FakeRuntime:
    def __init__(self) -> None:
        self.events = FakeEventsHub()

    def list_runs(self) -> list[dict[str, object]]:
        return []


class FakeTerminalRuntime:
    def list_terminals(self) -> list[dict[str, object]]:
        return []

    def list_sequences(self) -> list[dict[str, object]]:
        return []


class FakeWebSocket:
    def __init__(self, exc: Exception) -> None:
        self._exc = exc
        self.sent_payloads: list[SnapshotEventMessage] = []

    async def send_json(self, payload: object) -> None:
        self.sent_payloads.append(cast(SnapshotEventMessage, payload))

    async def receive_text(self) -> str:
        raise self._exc


@pytest.mark.asyncio
async def test_events_socket_handles_disconnect():
    runtime = FakeRuntime()
    terminal_runtime = FakeTerminalRuntime()
    websocket = FakeWebSocket(WebSocketDisconnect(code=1000))

    await events_socket(
        websocket=cast(WebSocket, websocket),
        runtime=cast(RuntimeManager, runtime),
        terminal_runtime=cast("TerminalRuntimeManager", terminal_runtime),
    )

    assert runtime.events.connected is True
    assert runtime.events.disconnected is True
    assert websocket.sent_payloads[0]["type"] == "snapshot"


@pytest.mark.asyncio
async def test_events_socket_handles_unexpected_error():
    runtime = FakeRuntime()
    terminal_runtime = FakeTerminalRuntime()
    websocket = FakeWebSocket(RuntimeError("boom"))

    with pytest.raises(RuntimeError, match="boom"):
        await events_socket(
            websocket=cast(WebSocket, websocket),
            runtime=cast(RuntimeManager, runtime),
            terminal_runtime=cast("TerminalRuntimeManager", terminal_runtime),
        )

    assert runtime.events.connected is True
    assert runtime.events.disconnected is True
