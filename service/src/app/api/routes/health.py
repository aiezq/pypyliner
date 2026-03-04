from fastapi import APIRouter

from src.app.services.runtime import now_iso

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "timestamp": now_iso()}
