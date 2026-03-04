from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse

from src.app.deps import get_runtime
from src.app.schemas.terminal import (
    ManualTerminalAutocompletePayload,
    ManualTerminalCommandPayload,
    ManualTerminalCreatePayload,
    ManualTerminalRenamePayload,
)
from src.app.schemas.responses import (
    ManualTerminalCompletionResponse,
    ManualTerminalDeleteResponse,
    ManualTerminalResponse,
    ManualTerminalsListResponse,
)
from src.app.services.runtime import RuntimeManager

router = APIRouter(prefix="/api/terminals", tags=["terminals"])


def _read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


@router.get("", response_model=ManualTerminalsListResponse)
async def get_terminals(runtime: RuntimeManager = Depends(get_runtime)) -> ManualTerminalsListResponse:
    return ManualTerminalsListResponse.model_validate(
        {"manual_terminals": runtime.list_manual_terminals()}
    )


@router.post("", response_model=ManualTerminalResponse)
async def create_terminal(
    payload: ManualTerminalCreatePayload,
    runtime: RuntimeManager = Depends(get_runtime),
) -> ManualTerminalResponse:
    return ManualTerminalResponse.model_validate(await runtime.create_manual_terminal(payload))


@router.post("/{terminal_id}/run", response_model=ManualTerminalResponse)
async def run_terminal_command(
    terminal_id: str,
    payload: ManualTerminalCommandPayload,
    runtime: RuntimeManager = Depends(get_runtime),
) -> ManualTerminalResponse:
    return ManualTerminalResponse.model_validate(
        await runtime.run_manual_terminal_command(terminal_id, payload)
    )


@router.post("/{terminal_id}/complete", response_model=ManualTerminalCompletionResponse)
async def complete_terminal_command(
    terminal_id: str,
    payload: ManualTerminalAutocompletePayload,
    runtime: RuntimeManager = Depends(get_runtime),
) -> ManualTerminalCompletionResponse:
    return ManualTerminalCompletionResponse.model_validate(
        await runtime.complete_manual_terminal_command(terminal_id, payload)
    )


@router.patch("/{terminal_id}", response_model=ManualTerminalResponse)
async def rename_terminal(
    terminal_id: str,
    payload: ManualTerminalRenamePayload,
    runtime: RuntimeManager = Depends(get_runtime),
) -> ManualTerminalResponse:
    return ManualTerminalResponse.model_validate(
        await runtime.rename_manual_terminal(terminal_id, payload)
    )


@router.post("/{terminal_id}/stop", response_model=ManualTerminalResponse)
async def stop_terminal(
    terminal_id: str,
    runtime: RuntimeManager = Depends(get_runtime),
) -> ManualTerminalResponse:
    return ManualTerminalResponse.model_validate(await runtime.stop_manual_terminal(terminal_id))


@router.post("/{terminal_id}/clear", response_model=ManualTerminalResponse)
async def clear_terminal(
    terminal_id: str,
    runtime: RuntimeManager = Depends(get_runtime),
) -> ManualTerminalResponse:
    return ManualTerminalResponse.model_validate(await runtime.clear_manual_terminal(terminal_id))


@router.delete("/{terminal_id}", response_model=ManualTerminalDeleteResponse)
async def close_terminal(
    terminal_id: str,
    runtime: RuntimeManager = Depends(get_runtime),
) -> ManualTerminalDeleteResponse:
    await runtime.close_manual_terminal(terminal_id)
    return ManualTerminalDeleteResponse.model_validate({"deleted": True, "terminal_id": terminal_id})


@router.get("/{terminal_id}/log", response_class=PlainTextResponse)
async def get_terminal_log(
    terminal_id: str,
    runtime: RuntimeManager = Depends(get_runtime),
) -> str:
    return _read_text(runtime.get_terminal_log_path(terminal_id))
