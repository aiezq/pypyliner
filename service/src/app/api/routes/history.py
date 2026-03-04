from fastapi import APIRouter, Depends

from src.app.deps import get_runtime
from src.app.schemas.responses import HistoryResponse
from src.app.services.runtime import RuntimeManager

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=HistoryResponse)
async def get_history(runtime: RuntimeManager = Depends(get_runtime)) -> HistoryResponse:
    return HistoryResponse.model_validate(runtime.history())
