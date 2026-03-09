from fastapi import APIRouter, Depends

from src.app.deps import get_ai_model_manager, get_pipeline_draft_generator
from src.app.schemas.ai import (
    AIModelStatusResponse,
    AIModelsResponse,
    AnalyzeDocumentationRequest,
    AnalyzeDocumentationResponse,
    GeneratePipelineDraftRequest,
    GeneratePipelineDraftResponse,
)
from src.app.services.ai_models import AIModelManager
from src.app.services.pipeline_drafts import PipelineDraftGenerator

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/models", response_model=AIModelsResponse)
async def list_ai_models(
    manager: AIModelManager = Depends(get_ai_model_manager),
) -> AIModelsResponse:
    return await manager.list_models()


@router.post("/models/{model_id}/install", response_model=AIModelStatusResponse)
async def install_ai_model(
    model_id: str,
    manager: AIModelManager = Depends(get_ai_model_manager),
) -> AIModelStatusResponse:
    return await manager.install_model(model_id)


@router.get("/models/{model_id}/status", response_model=AIModelStatusResponse)
async def get_ai_model_status(
    model_id: str,
    manager: AIModelManager = Depends(get_ai_model_manager),
) -> AIModelStatusResponse:
    return await manager.get_model_status(model_id)


@router.post("/models/{model_id}/cancel-install", response_model=AIModelStatusResponse)
async def cancel_ai_model_install(
    model_id: str,
    manager: AIModelManager = Depends(get_ai_model_manager),
) -> AIModelStatusResponse:
    return await manager.cancel_install(model_id)


@router.post("/models/{model_id}/load", response_model=AIModelStatusResponse)
async def load_ai_model(
    model_id: str,
    manager: AIModelManager = Depends(get_ai_model_manager),
) -> AIModelStatusResponse:
    return await manager.load_model(model_id)


@router.post("/models/{model_id}/unload", response_model=AIModelStatusResponse)
async def unload_ai_model(
    model_id: str,
    manager: AIModelManager = Depends(get_ai_model_manager),
) -> AIModelStatusResponse:
    return await manager.unload_model(model_id)


@router.delete("/models/{model_id}", response_model=AIModelStatusResponse)
async def remove_ai_model(
    model_id: str,
    manager: AIModelManager = Depends(get_ai_model_manager),
) -> AIModelStatusResponse:
    return await manager.remove_model(model_id)


@router.post("/pipeline-drafts/clarify", response_model=AnalyzeDocumentationResponse)
async def analyze_pipeline_documentation(
    payload: AnalyzeDocumentationRequest,
    generator: PipelineDraftGenerator = Depends(get_pipeline_draft_generator),
) -> AnalyzeDocumentationResponse:
    return await generator.analyze_documentation(payload)


@router.post("/pipeline-drafts/generate", response_model=GeneratePipelineDraftResponse)
async def generate_pipeline_draft(
    payload: GeneratePipelineDraftRequest,
    generator: PipelineDraftGenerator = Depends(get_pipeline_draft_generator),
) -> GeneratePipelineDraftResponse:
    return await generator.generate(payload)
