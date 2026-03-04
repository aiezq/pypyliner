from fastapi import APIRouter

from src.app.api.routes.command_packs import router as command_packs_router
from src.app.api.routes.events import router as events_router
from src.app.api.routes.health import router as health_router
from src.app.api.routes.history import router as history_router
from src.app.api.routes.pipeline_flows import router as pipeline_flows_router
from src.app.api.routes.runs import router as runs_router
from src.app.api.routes.state import router as state_router
from src.app.api.routes.terminals import router as terminals_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(state_router)
api_router.include_router(history_router)
api_router.include_router(pipeline_flows_router)
api_router.include_router(runs_router)
api_router.include_router(terminals_router)
api_router.include_router(command_packs_router)
api_router.include_router(events_router)
