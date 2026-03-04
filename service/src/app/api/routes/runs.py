from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse

from src.app.api.errors import raise_http_error
from src.app.deps import get_runtime
from src.app.schemas.pipeline import PipelineRunCreatePayload
from src.app.services.runtime import RuntimeManager, ServiceError

router = APIRouter(prefix="/api/runs", tags=["runs"])


def _read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


@router.get("")
async def get_runs(runtime: RuntimeManager = Depends(get_runtime)) -> dict[str, Any]:
    return {"runs": runtime.list_runs()}


@router.get("/{run_id}")
async def get_run(run_id: str, runtime: RuntimeManager = Depends(get_runtime)) -> dict[str, Any]:
    try:
        return runtime.get_run(run_id)
    except ServiceError as error:
        raise_http_error(error)


@router.post("")
async def create_run(
    payload: PipelineRunCreatePayload,
    runtime: RuntimeManager = Depends(get_runtime),
) -> dict[str, Any]:
    return await runtime.create_pipeline_run(payload)


@router.post("/{run_id}/stop")
async def stop_run(run_id: str, runtime: RuntimeManager = Depends(get_runtime)) -> dict[str, Any]:
    try:
        return await runtime.stop_pipeline_run(run_id)
    except ServiceError as error:
        raise_http_error(error)


@router.get("/{run_id}/log", response_class=PlainTextResponse)
async def get_run_log(run_id: str, runtime: RuntimeManager = Depends(get_runtime)) -> str:
    try:
        return _read_text(runtime.get_run_log_path(run_id))
    except ServiceError as error:
        raise_http_error(error)
