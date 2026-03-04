from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI

from src.app import main as app_main


@pytest.mark.asyncio
async def test_lifespan_initializes_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    runtime = SimpleNamespace(ensure_dirs=AsyncMock())
    command_packs = SimpleNamespace(ensure_ready=AsyncMock())
    pipeline_flows = SimpleNamespace(ensure_ready=AsyncMock())
    history_db = SimpleNamespace(ensure_ready=MagicMock())

    configure_logging = MagicMock()
    run_migrations = MagicMock()

    monkeypatch.setattr(app_main, "configure_logging", configure_logging)
    monkeypatch.setattr(app_main, "run_migrations", run_migrations)
    monkeypatch.setattr(app_main, "get_runtime", lambda: runtime)
    monkeypatch.setattr(app_main, "get_command_pack_manager", lambda: command_packs)
    monkeypatch.setattr(app_main, "get_pipeline_flow_manager", lambda: pipeline_flows)
    monkeypatch.setattr(app_main, "get_history_database", lambda: history_db)

    async with app_main.lifespan(FastAPI()):
        pass

    configure_logging.assert_called_once()
    run_migrations.assert_called_once()
    history_db.ensure_ready.assert_called_once()
    runtime.ensure_dirs.assert_awaited_once()
    command_packs.ensure_ready.assert_awaited_once()
    pipeline_flows.ensure_ready.assert_awaited_once()
