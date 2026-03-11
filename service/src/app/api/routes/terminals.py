from fastapi import APIRouter, Depends, Response

from src.app.deps import get_terminal_runtime
from src.app.schemas.responses import TerminalSessionResponse, TerminalsListResponse
from src.app.schemas.terminal import TerminalAppendCommandPayload, TerminalCreatePayload, TerminalExecutionPayload
from src.app.services.terminal_runtime import TerminalRuntimeManager

router = APIRouter(prefix="/api/terminals", tags=["terminals"])


@router.get("", response_model=TerminalsListResponse)
async def get_terminals(
    runtime: TerminalRuntimeManager = Depends(get_terminal_runtime),
) -> TerminalsListResponse:
    return TerminalsListResponse.model_validate({"terminals": runtime.list_terminals()})


@router.get("/{terminal_session_id}", response_model=TerminalSessionResponse)
async def get_terminal(
    terminal_session_id: str,
    runtime: TerminalRuntimeManager = Depends(get_terminal_runtime),
) -> TerminalSessionResponse:
    return TerminalSessionResponse.model_validate(runtime.get_terminal(terminal_session_id))


@router.post("", response_model=TerminalSessionResponse)
async def create_terminal(
    payload: TerminalCreatePayload,
    runtime: TerminalRuntimeManager = Depends(get_terminal_runtime),
) -> TerminalSessionResponse:
    return TerminalSessionResponse.model_validate(await runtime.create_terminal(payload))


@router.post("/execute", response_model=TerminalSessionResponse)
async def execute_terminal(
    payload: TerminalExecutionPayload,
    runtime: TerminalRuntimeManager = Depends(get_terminal_runtime),
) -> TerminalSessionResponse:
    return TerminalSessionResponse.model_validate(await runtime.execute_terminal(payload))


@router.post("/{terminal_session_id}/commands", response_model=TerminalSessionResponse)
async def append_terminal_command(
    terminal_session_id: str,
    payload: TerminalAppendCommandPayload,
    runtime: TerminalRuntimeManager = Depends(get_terminal_runtime),
) -> TerminalSessionResponse:
    return TerminalSessionResponse.model_validate(
        await runtime.append_terminal_command(terminal_session_id, payload)
    )


@router.post("/{terminal_session_id}/stop", response_model=TerminalSessionResponse)
async def stop_terminal(
    terminal_session_id: str,
    runtime: TerminalRuntimeManager = Depends(get_terminal_runtime),
) -> TerminalSessionResponse:
    return TerminalSessionResponse.model_validate(await runtime.stop_terminal(terminal_session_id))


@router.post("/{terminal_session_id}/clear", response_model=TerminalSessionResponse)
async def clear_terminal(
    terminal_session_id: str,
    runtime: TerminalRuntimeManager = Depends(get_terminal_runtime),
) -> TerminalSessionResponse:
    return TerminalSessionResponse.model_validate(await runtime.clear_terminal(terminal_session_id))


@router.delete("/{terminal_session_id}", status_code=204)
async def delete_terminal(
    terminal_session_id: str,
    runtime: TerminalRuntimeManager = Depends(get_terminal_runtime),
) -> Response:
    await runtime.delete_terminal(terminal_session_id)
    return Response(status_code=204)
