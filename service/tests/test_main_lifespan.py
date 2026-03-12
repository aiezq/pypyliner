from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI

from src.app import main as app_main


@pytest.mark.asyncio
async def test_lifespan_initializes_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    runtime = SimpleNamespace(ensure_dirs=AsyncMock())
    terminal_runtime = SimpleNamespace(ensure_ready=AsyncMock())
    command_packs = SimpleNamespace(ensure_ready=AsyncMock())
    pipeline_flows = SimpleNamespace(ensure_ready=AsyncMock())
    ai_models = SimpleNamespace(ensure_ready=AsyncMock())
    history_db = SimpleNamespace(ensure_ready=MagicMock())
    services = SimpleNamespace(
        runtime_manager=runtime,
        terminal_runtime_manager=terminal_runtime,
        command_pack_manager=command_packs,
        pipeline_flow_manager=pipeline_flows,
        history_database=history_db,
        ai_model_manager=ai_models,
    )
    logger = MagicMock()

    configure_logging = MagicMock()
    run_migrations = MagicMock()

    monkeypatch.setattr(app_main, "configure_logging", configure_logging)
    monkeypatch.setattr(app_main, "run_migrations", run_migrations)
    monkeypatch.setattr(app_main, "build_application_services", lambda: services)
    monkeypatch.setattr(app_main, "LOGGER", logger)

    app = FastAPI()
    async with app_main.lifespan(app):
        pass

    configure_logging.assert_called_once()
    run_migrations.assert_called_once()
    history_db.ensure_ready.assert_called_once()
    runtime.ensure_dirs.assert_awaited_once()
    terminal_runtime.ensure_ready.assert_awaited_once()
    command_packs.ensure_ready.assert_awaited_once()
    pipeline_flows.ensure_ready.assert_awaited_once()
    ai_models.ensure_ready.assert_awaited_once()
    assert app.state.services is services
    assert logger.info.call_args_list[-1].args == ("Application startup complete",)
