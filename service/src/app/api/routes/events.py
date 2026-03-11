from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from src.app.deps import get_runtime, get_terminal_runtime
from src.app.schemas.terminal import TerminalInputPayload, TerminalResizePayload
from src.app.services.runtime import RuntimeManager, ServiceError
from src.app.services.terminal_runtime import TerminalRuntimeManager

router = APIRouter(tags=["events"])


@router.websocket("/ws/events")
async def events_socket(
    websocket: WebSocket,
    runtime: RuntimeManager = Depends(get_runtime),
    terminal_runtime: TerminalRuntimeManager = Depends(get_terminal_runtime),
) -> None:
    await runtime.events.connect(websocket)
    try:
        await websocket.send_json(
            {
                "type": "snapshot",
                "data": {
                    "runs": runtime.list_runs(),
                    "terminals": terminal_runtime.list_terminals(),
                    "sequences": terminal_runtime.list_sequences(),
                },
            }
        )
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await runtime.events.disconnect(websocket)


@router.websocket("/ws/terminals/{terminal_session_id}")
async def terminal_socket(
    websocket: WebSocket,
    terminal_session_id: str,
    terminal_runtime: TerminalRuntimeManager = Depends(get_terminal_runtime),
) -> None:
    snapshot = await terminal_runtime.connect_terminal_stream(websocket, terminal_session_id)
    await websocket.send_json(snapshot)

    try:
        while True:
            payload = await websocket.receive_json()
            if not isinstance(payload, dict):
                continue
            message_type = payload.get("type")
            if message_type == "input":
                try:
                    parsed = TerminalInputPayload.model_validate(payload)
                except ValidationError:
                    continue
                await terminal_runtime.write_terminal_input(terminal_session_id, parsed.data)
                continue
            if message_type == "resize":
                try:
                    parsed = TerminalResizePayload.model_validate(payload)
                except ValidationError:
                    continue
                await terminal_runtime.resize_terminal(
                    terminal_session_id,
                    cols=parsed.cols,
                    rows=parsed.rows,
                )
    except ServiceError:
        pass
    except WebSocketDisconnect:
        pass
    finally:
        await terminal_runtime.disconnect_terminal_stream(websocket, terminal_session_id)
