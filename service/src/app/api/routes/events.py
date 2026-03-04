from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from src.app.deps import get_runtime
from src.app.services.runtime import RuntimeManager

router = APIRouter(tags=["events"])


@router.websocket("/ws/events")
async def events_socket(
    websocket: WebSocket,
    runtime: RuntimeManager = Depends(get_runtime),
) -> None:
    await runtime.events.connect(websocket)
    try:
        await websocket.send_json(runtime.snapshot_event())
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await runtime.events.disconnect(websocket)
