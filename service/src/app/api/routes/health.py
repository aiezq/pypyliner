from fastapi import APIRouter

from src.app.schemas.responses import HealthResponse
from src.app.services.runtime import now_iso

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", timestamp=now_iso())
