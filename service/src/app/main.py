from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.app.api.errors import service_error_handler
from src.app.api.router import api_router
from src.app.core.database import run_migrations
from src.app.core.logging import configure_logging
from src.app.deps import (
    get_command_pack_manager,
    get_history_database,
    get_pipeline_flow_manager,
    get_runtime,
)
from src.app.services.runtime import ServiceError


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    run_migrations()
    runtime = get_runtime()
    command_packs = get_command_pack_manager()
    pipeline_flows = get_pipeline_flow_manager()
    history_db = get_history_database()
    history_db.ensure_ready()
    await runtime.ensure_dirs()
    await command_packs.ensure_ready()
    await pipeline_flows.ensure_ready()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Operator Helper API",
        description="Local API for sequential Linux command pipelines and manual terminals.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_exception_handler(ServiceError, service_error_handler)
    app.include_router(api_router)
    return app


app = create_app()
