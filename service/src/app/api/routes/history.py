from fastapi import APIRouter, Depends

from src.app.deps import get_runtime
from src.app.services.runtime import RuntimeManager

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
async def get_history(runtime: RuntimeManager = Depends(get_runtime)) -> dict[str, object]:
    return runtime.history()
