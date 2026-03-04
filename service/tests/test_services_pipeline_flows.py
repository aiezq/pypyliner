from __future__ import annotations

from typing import Any, Callable, cast

import pytest

from src.app.models.db import PipelineFlowRecord, PipelineFlowStepRecord
from src.app.services.pipeline_flows import PipelineFlowManager
from src.app.services.runtime import ServiceError


def test_pipeline_flow_slugify_and_normalize() -> None:
    slugify = cast(Callable[[str, str], str], getattr(PipelineFlowManager, "_slugify"))
    normalize_flow = cast(
        Callable[[dict[str, Any], str], dict[str, Any]],
        getattr(PipelineFlowManager(), "_normalize_flow_dict"),
    )
    assert slugify(" My Flow! ", "fallback") == "my_flow"
    assert slugify("---", "fallback") == "---"

    normalized = normalize_flow(
        {
            "id": "legacy_id",
            "name": "Legacy Name",
            "steps": [{"type": "custom", "label": "Run", "command": "echo 1"}],
        },
        "legacy.json",
    )
    assert normalized["flow_id"] == "legacy_id"
    assert normalized["flow_name"] == "Legacy Name"
    assert len(normalized["steps"]) == 1


def test_validate_flow_applies_slug_and_trims_values():
    manager = PipelineFlowManager()
    validate_flow = cast(Callable[[dict[str, Any], str], Any], getattr(manager, "_validate_flow"))
    parsed = validate_flow(
        {
            "flow_id": " Flow 1 ",
            "flow_name": " Flow Name ",
            "created_at": "2026-03-05T00:00:00Z",
            "updated_at": "2026-03-05T00:00:00Z",
            "steps": [{"type": "custom", "label": "  Run  ", "command": "echo 1"}],
        },
        "flow.json",
    )
    assert parsed.flow_id == "flow_1"
    assert parsed.flow_name == "Flow Name"
    assert parsed.steps[0].label == "  Run  "


def test_validate_flow_rejects_invalid_payload():
    manager = PipelineFlowManager()
    validate_flow = cast(Callable[[dict[str, Any], str], Any], getattr(manager, "_validate_flow"))
    with pytest.raises(ServiceError):
        validate_flow({"flow_name": ""}, "broken.json")


def test_serialize_flow() -> None:
    flow = PipelineFlowRecord(
        flow_id="flow_1",
        flow_name="Flow #1",
        created_at="2026-03-05T00:00:00Z",
        updated_at="2026-03-05T00:00:01Z",
    )
    steps = [
        PipelineFlowStepRecord(
            id=1,
            flow_id="flow_1",
            position=1,
            step_type="custom",
            label="Run",
            command="echo 1",
        )
    ]

    serialize_flow = cast(
        Callable[[PipelineFlowRecord, list[PipelineFlowStepRecord]], dict[str, Any]],
        getattr(PipelineFlowManager, "_serialize_flow"),
    )
    serialized = serialize_flow(flow, steps)
    assert serialized["id"] == "flow_1"
    assert serialized["file_name"] == "flow_1.json"
    assert serialized["steps"][0]["command"] == "echo 1"
