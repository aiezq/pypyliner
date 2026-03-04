from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse

from src.app.api.errors import raise_http_error
from src.app.deps import get_runtime
from src.app.schemas.terminal import (
    ManualTerminalAutocompletePayload,
    ManualTerminalCommandPayload,
    ManualTerminalCreatePayload,
    ManualTerminalRenamePayload,
)
from src.app.services.runtime import RuntimeManager, ServiceError

router = APIRouter(prefix="/api/terminals", tags=["terminals"])


def _read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


@router.get("")
async def get_terminals(runtime: RuntimeManager = Depends(get_runtime)) -> dict[str, Any]:
    return {"manual_terminals": runtime.list_manual_terminals()}


@router.post("")
async def create_terminal(
    payload: ManualTerminalCreatePayload,
    runtime: RuntimeManager = Depends(get_runtime),
) -> dict[str, Any]:
    return await runtime.create_manual_terminal(payload)


@router.post("/{terminal_id}/run")
async def run_terminal_command(
    terminal_id: str,
    payload: ManualTerminalCommandPayload,
    runtime: RuntimeManager = Depends(get_runtime),
) -> dict[str, Any]:
    try:
        return await runtime.run_manual_terminal_command(terminal_id, payload)
    except ServiceError as error:
        raise_http_error(error)


@router.post("/{terminal_id}/complete")
async def complete_terminal_command(
    terminal_id: str,
    payload: ManualTerminalAutocompletePayload,
    runtime: RuntimeManager = Depends(get_runtime),
) -> dict[str, Any]:
    try:
        return await runtime.complete_manual_terminal_command(terminal_id, payload)
    except ServiceError as error:
        raise_http_error(error)


@router.patch("/{terminal_id}")
async def rename_terminal(
    terminal_id: str,
    payload: ManualTerminalRenamePayload,
    runtime: RuntimeManager = Depends(get_runtime),
) -> dict[str, Any]:
    try:
        return await runtime.rename_manual_terminal(terminal_id, payload)
    except ServiceError as error:
        raise_http_error(error)


@router.post("/{terminal_id}/stop")
async def stop_terminal(
    terminal_id: str,
    runtime: RuntimeManager = Depends(get_runtime),
) -> dict[str, Any]:
    try:
        return await runtime.stop_manual_terminal(terminal_id)
    except ServiceError as error:
        raise_http_error(error)


@router.post("/{terminal_id}/clear")
async def clear_terminal(
    terminal_id: str,
    runtime: RuntimeManager = Depends(get_runtime),
) -> dict[str, Any]:
    try:
        return await runtime.clear_manual_terminal(terminal_id)
    except ServiceError as error:
        raise_http_error(error)


@router.delete("/{terminal_id}")
async def close_terminal(
    terminal_id: str,
    runtime: RuntimeManager = Depends(get_runtime),
) -> dict[str, Any]:
    try:
        await runtime.close_manual_terminal(terminal_id)
        return {"deleted": True, "terminal_id": terminal_id}
    except ServiceError as error:
        raise_http_error(error)


@router.get("/{terminal_id}/log", response_class=PlainTextResponse)
async def get_terminal_log(
    terminal_id: str,
    runtime: RuntimeManager = Depends(get_runtime),
) -> str:
    try:
        return _read_text(runtime.get_terminal_log_path(terminal_id))
    except ServiceError as error:
        raise_http_error(error)
