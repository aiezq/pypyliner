from fastapi import APIRouter, Depends

from src.app.deps import get_runtime
from src.app.schemas.responses import StateSnapshotResponse
from src.app.services.runtime import RuntimeManager

router = APIRouter(prefix="/api", tags=["state"])


@router.get("/state", response_model=StateSnapshotResponse)
async def get_state(runtime: RuntimeManager = Depends(get_runtime)) -> StateSnapshotResponse:
    return StateSnapshotResponse.model_validate(runtime.snapshot())
