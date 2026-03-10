import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.app.api.errors import service_error_handler, unexpected_error_handler
from src.app.api.router import api_router
from src.app.core.database import run_migrations
from src.app.core.logging import configure_logging, log_http_request
from src.app.deps import (
    get_ai_model_manager,
    get_command_pack_manager,
    get_history_database,
    get_pipeline_flow_manager,
    get_runtime,
)
from src.app.services.runtime import ServiceError

LOGGER = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    LOGGER.info("Startup: running database migrations")
    run_migrations()
    LOGGER.info("Startup: database migrations complete")
    runtime = get_runtime()
    command_packs = get_command_pack_manager()
    pipeline_flows = get_pipeline_flow_manager()
    history_db = get_history_database()
    ai_models = get_ai_model_manager()
    LOGGER.info("Startup: initializing history database")
    history_db.ensure_ready()
    LOGGER.info("Startup: history database ready")
    LOGGER.info("Startup: ensuring runtime directories")
    await runtime.ensure_dirs()
    LOGGER.info("Startup: runtime directories ready")
    LOGGER.info("Startup: loading command packs")
    await command_packs.ensure_ready()
    LOGGER.info("Startup: command packs ready")
    LOGGER.info("Startup: loading pipeline flows")
    await pipeline_flows.ensure_ready()
    LOGGER.info("Startup: pipeline flows ready")
    LOGGER.info("Startup: ensuring AI model state")
    await ai_models.ensure_ready()
    LOGGER.info("Application startup complete")
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
    app.middleware("http")(log_http_request)
    app.add_exception_handler(ServiceError, service_error_handler)
    app.add_exception_handler(Exception, unexpected_error_handler)
    app.include_router(api_router)
    return app


app = create_app()
