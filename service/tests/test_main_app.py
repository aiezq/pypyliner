from __future__ import annotations

from src.app.main import create_app
from src.app.services.runtime import ServiceError


def test_create_app_registers_routes_and_service_error_handler():
    app = create_app()

    paths = {path for route in app.routes if isinstance(path := getattr(route, "path", None), str)}
    assert "/health" in paths
    assert "/api/ai/models" in paths
    assert "/api/state" in paths
    assert "/api/terminals" in paths
    assert "/api/terminals/execute" in paths
    assert "/api/sequences/execute" in paths
    assert "/ws/events" in paths

    handler = app.exception_handlers.get(ServiceError)
    assert handler is not None
    assert app.exception_handlers.get(Exception) is not None
