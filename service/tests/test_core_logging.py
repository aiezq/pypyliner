from __future__ import annotations

import logging
from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.requests import Request
from starlette.responses import JSONResponse

from src.app.core import logging as app_logging


def test_configure_logging_is_idempotent(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(app_logging, "_logging_configured", False)

    basic_config = MagicMock()
    structlog_configure = MagicMock()
    monkeypatch.setattr(app_logging.logging, "basicConfig", basic_config)
    monkeypatch.setattr(app_logging.structlog, "configure", structlog_configure)

    app_logging.configure_logging(level=logging.DEBUG)
    app_logging.configure_logging(level=logging.INFO)

    basic_config.assert_called_once()
    structlog_configure.assert_called_once()


@pytest.mark.asyncio
async def test_log_http_request_logs_method_path_and_status(monkeypatch: pytest.MonkeyPatch):
    logger = MagicMock()
    monkeypatch.setattr(app_logging, "ACCESS_LOGGER", logger)
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/terminals",
            "scheme": "http",
            "server": ("127.0.0.1", 8000),
            "headers": [],
        }
    )
    call_next = AsyncMock(return_value=JSONResponse({"ok": True}, status_code=201))

    response = await app_logging.log_http_request(request, call_next)

    assert response.status_code == 201
    call_next.assert_awaited_once_with(request)
    logger.info.assert_called_once()
    args = logger.info.call_args.args
    assert args[:4] == ("%s %s -> %s %.2fms", "POST", "/api/terminals", 201)
