from typing import Any

from fastapi import APIRouter, Depends

from src.app.api.errors import raise_http_error
from src.app.deps import get_pipeline_flow_manager
from src.app.schemas.pipeline_flow import PipelineFlowCreatePayload
from src.app.services.pipeline_flows import PipelineFlowManager
from src.app.services.runtime import ServiceError

router = APIRouter(prefix="/api/pipeline-flows", tags=["pipeline-flows"])


@router.get("")
async def list_pipeline_flows(
    manager: PipelineFlowManager = Depends(get_pipeline_flow_manager),
) -> dict[str, Any]:
    return manager.list_flows()


@router.post("")
async def create_pipeline_flow(
    payload: PipelineFlowCreatePayload,
    manager: PipelineFlowManager = Depends(get_pipeline_flow_manager),
) -> dict[str, Any]:
    try:
        return manager.create_flow(payload)
    except ServiceError as error:
        raise_http_error(error)


@router.put("/{flow_id}")
async def update_pipeline_flow(
    flow_id: str,
    payload: PipelineFlowCreatePayload,
    manager: PipelineFlowManager = Depends(get_pipeline_flow_manager),
) -> dict[str, Any]:
    try:
        return manager.update_flow(flow_id, payload)
    except ServiceError as error:
        raise_http_error(error)


@router.delete("/{flow_id}")
async def delete_pipeline_flow(
    flow_id: str,
    manager: PipelineFlowManager = Depends(get_pipeline_flow_manager),
) -> dict[str, Any]:
    try:
        return manager.delete_flow(flow_id)
    except ServiceError as error:
        raise_http_error(error)
