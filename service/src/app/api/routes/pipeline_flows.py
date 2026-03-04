from fastapi import APIRouter, Depends

from src.app.deps import get_pipeline_flow_manager
from src.app.schemas.pipeline_flow import PipelineFlowCreatePayload
from src.app.schemas.responses import (
    PipelineFlowDeleteResponse,
    PipelineFlowListResponse,
    PipelineFlowResponse,
)
from src.app.services.pipeline_flows import PipelineFlowManager

router = APIRouter(prefix="/api/pipeline-flows", tags=["pipeline-flows"])


@router.get("", response_model=PipelineFlowListResponse)
async def list_pipeline_flows(
    manager: PipelineFlowManager = Depends(get_pipeline_flow_manager),
) -> PipelineFlowListResponse:
    return PipelineFlowListResponse.model_validate(manager.list_flows())


@router.post("", response_model=PipelineFlowResponse)
async def create_pipeline_flow(
    payload: PipelineFlowCreatePayload,
    manager: PipelineFlowManager = Depends(get_pipeline_flow_manager),
) -> PipelineFlowResponse:
    return PipelineFlowResponse.model_validate(manager.create_flow(payload))


@router.put("/{flow_id}", response_model=PipelineFlowResponse)
async def update_pipeline_flow(
    flow_id: str,
    payload: PipelineFlowCreatePayload,
    manager: PipelineFlowManager = Depends(get_pipeline_flow_manager),
) -> PipelineFlowResponse:
    return PipelineFlowResponse.model_validate(manager.update_flow(flow_id, payload))


@router.delete("/{flow_id}", response_model=PipelineFlowDeleteResponse)
async def delete_pipeline_flow(
    flow_id: str,
    manager: PipelineFlowManager = Depends(get_pipeline_flow_manager),
) -> PipelineFlowDeleteResponse:
    return PipelineFlowDeleteResponse.model_validate(manager.delete_flow(flow_id))
