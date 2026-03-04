from fastapi import APIRouter, Depends

from src.app.deps import get_runtime
from src.app.services.runtime import RuntimeManager

router = APIRouter(prefix="/api", tags=["state"])


@router.get("/state")
async def get_state(runtime: RuntimeManager = Depends(get_runtime)) -> dict[str, object]:
    return runtime.snapshot()
