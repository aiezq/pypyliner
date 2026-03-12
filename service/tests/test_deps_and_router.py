from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from starlette.requests import HTTPConnection

from src.app.api.router import api_router
from src.app.deps import get_application_services, get_runtime


def test_deps_read_services_from_app_state():
    app = FastAPI()
    services = SimpleNamespace(runtime_manager=object())
    app.state.services = services
    scope = {"type": "http", "app": app, "headers": [], "query_string": b""}
    connection = HTTPConnection(scope)

    assert get_application_services(connection) is services
    assert get_runtime(connection) is services.runtime_manager


def test_api_router_contains_expected_paths():
    paths = {
        path for route in api_router.routes if isinstance(path := getattr(route, "path", None), str)
    }
    assert "/health" in paths
    assert "/api/state" in paths
    assert "/api/history" in paths
    assert "/api/runs" in paths
    assert "/api/terminals" in paths
    assert "/api/terminals/execute" in paths
    assert "/api/sequences/execute" in paths
    assert "/api/command-packs" in paths
    assert "/ws/events" in paths
