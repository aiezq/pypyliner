from __future__ import annotations

from typing import Any

from fastapi import WebSocket


class TerminalStreamTransport:
    def __init__(self, *, max_buffer_size: int) -> None:
        self.max_buffer_size = max_buffer_size
        self.clients: dict[str, set[WebSocket]] = {}
        self.buffers: dict[str, str] = {}

    def get_buffer(self, terminal_id: str) -> str:
        return self.buffers.get(terminal_id, "")

    def set_buffer(self, terminal_id: str, text: str) -> None:
        self.buffers[terminal_id] = text[-self.max_buffer_size :]

    def clear_buffer(self, terminal_id: str) -> None:
        self.buffers[terminal_id] = ""

    def drop_terminal(self, terminal_id: str) -> None:
        self.buffers.pop(terminal_id, None)
        self.clients.pop(terminal_id, None)

    async def connect(
        self,
        websocket: WebSocket,
        terminal_id: str,
        *,
        fallback_buffer: str | None,
        read_only: bool,
    ) -> dict[str, Any]:
        await websocket.accept()
        clients = self.clients.setdefault(terminal_id, set())
        clients.add(websocket)
        if fallback_buffer and not self.get_buffer(terminal_id):
            self.set_buffer(terminal_id, fallback_buffer)
        return {
            "type": "snapshot",
            "data": {
                "buffer": self.get_buffer(terminal_id),
                "read_only": read_only,
            },
        }

    async def disconnect(self, websocket: WebSocket, terminal_id: str) -> None:
        clients = self.clients.get(terminal_id)
        if not clients:
            return
        clients.discard(websocket)
        if not clients:
            self.clients.pop(terminal_id, None)

    async def broadcast_text(self, terminal_id: str, text: str) -> None:
        if not text:
            return
        self.set_buffer(terminal_id, self.get_buffer(terminal_id) + text)
        await self._broadcast(terminal_id, {"type": "data", "data": text})

    async def broadcast_reset(self, terminal_id: str) -> None:
        await self._broadcast(terminal_id, {"type": "reset"})

    async def broadcast_mode(self, terminal_id: str, *, read_only: bool) -> None:
        await self._broadcast(terminal_id, {"type": "mode", "data": {"read_only": read_only}})

    async def _broadcast(self, terminal_id: str, payload: dict[str, Any]) -> None:
        stale_clients: list[WebSocket] = []
        for client in tuple(self.clients.get(terminal_id, ())):
            try:
                await client.send_json(payload)
            except Exception:
                stale_clients.append(client)

        for client in stale_clients:
            await self.disconnect(client, terminal_id)
