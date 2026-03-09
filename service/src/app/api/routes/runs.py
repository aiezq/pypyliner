import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends, Response
from fastapi.responses import PlainTextResponse, StreamingResponse

from src.app.deps import get_runtime
from src.app.schemas.pipeline import PipelineRunCreatePayload
from src.app.schemas.responses import PipelineRunResponse, RunsListResponse
from src.app.services.runtime import RuntimeManager

router = APIRouter(prefix="/api/runs", tags=["runs"])


async def _iter_file_chunks(path: Path, chunk_size: int = 64 * 1024):
    file = await asyncio.to_thread(path.open, "rb")
    try:
        while True:
            chunk = await asyncio.to_thread(file.read, chunk_size)
            if not chunk:
                break
            yield chunk
    finally:
        await asyncio.to_thread(file.close)


def _stream_text(path: Path) -> PlainTextResponse | StreamingResponse:
    if not path.exists():
        return PlainTextResponse("")
    return StreamingResponse(_iter_file_chunks(path), media_type="text/plain; charset=utf-8")


@router.get("", response_model=RunsListResponse)
async def get_runs(runtime: RuntimeManager = Depends(get_runtime)) -> RunsListResponse:
    return RunsListResponse.model_validate({"runs": runtime.list_runs()})


@router.get("/{run_id}", response_model=PipelineRunResponse)
async def get_run(run_id: str, runtime: RuntimeManager = Depends(get_runtime)) -> PipelineRunResponse:
    return PipelineRunResponse.model_validate(runtime.get_run(run_id))


@router.post("", response_model=PipelineRunResponse)
async def create_run(
    payload: PipelineRunCreatePayload,
    runtime: RuntimeManager = Depends(get_runtime),
) -> PipelineRunResponse:
    return PipelineRunResponse.model_validate(await runtime.create_pipeline_run(payload))


@router.post("/{run_id}/stop", response_model=PipelineRunResponse)
async def stop_run(run_id: str, runtime: RuntimeManager = Depends(get_runtime)) -> PipelineRunResponse:
    return PipelineRunResponse.model_validate(await runtime.stop_pipeline_run(run_id))


@router.get("/{run_id}/log", response_model=None)
async def get_run_log(
    run_id: str,
    runtime: RuntimeManager = Depends(get_runtime),
) -> Response:
    return _stream_text(runtime.get_run_log_path(run_id))
