from __future__ import annotations

from src.app.api.router import api_router
from src.app.deps import (
    get_command_pack_manager,
    get_history_database,
    get_pipeline_flow_manager,
    get_runtime,
)


def test_deps_return_singletons():
    assert get_runtime() is get_runtime()
    assert get_command_pack_manager() is get_command_pack_manager()
    assert get_history_database() is get_history_database()
    assert get_pipeline_flow_manager() is get_pipeline_flow_manager()


def test_api_router_contains_expected_paths():
    paths = {
        path for route in api_router.routes if isinstance(path := getattr(route, "path", None), str)
    }
    assert "/health" in paths
    assert "/api/state" in paths
    assert "/api/history" in paths
    assert "/api/runs" in paths
    assert "/api/terminals" in paths
    assert "/api/command-packs" in paths
    assert "/ws/events" in paths
