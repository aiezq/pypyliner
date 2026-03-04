from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest

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
