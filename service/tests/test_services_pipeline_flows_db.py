from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy.engine import Engine
from sqlalchemy import delete

from src.app.core.database import session_scope
from src.app.models.db import PipelineFlowRecord, PipelineFlowStepRecord
from src.app.schemas.pipeline_flow import PipelineFlowCreatePayload, PipelineFlowStepPayload
from src.app.services.pipeline_flows import PipelineFlowManager


def _clear_pipeline_tables() -> None:
    with session_scope() as session:
        session.exec(delete(PipelineFlowStepRecord))
        session.exec(delete(PipelineFlowRecord))
        session.commit()


@pytest.mark.asyncio
async def test_pipeline_flows_bootstrap_and_crud(tmp_path: Path, isolated_db: Engine) -> None:
    _ = isolated_db
    _clear_pipeline_tables()

    manager = PipelineFlowManager()
    legacy_flows_dir = tmp_path / "pipeline_flows"
    setattr(manager, "_legacy_flows_dir", legacy_flows_dir)
    legacy_flows_dir.mkdir(parents=True, exist_ok=True)

    legacy_flow: dict[str, object] = {
        "flow_id": "legacy_flow",
        "flow_name": "Legacy Flow",
        "created_at": "2026-03-05T00:00:00Z",
        "updated_at": "2026-03-05T00:00:00Z",
        "steps": [{"type": "custom", "label": "Legacy", "command": "echo legacy"}],
    }
    (legacy_flows_dir / "legacy_flow.json").write_text(
        json.dumps(legacy_flow),
        encoding="utf-8",
    )

    await manager.ensure_ready()
    listed = manager.list_flows()
    assert any(flow["id"] == "legacy_flow" for flow in listed["flows"])

    created = manager.create_flow(
        PipelineFlowCreatePayload(
            flow_name="Flow #1",
            steps=[PipelineFlowStepPayload(type="custom", label="Run", command="echo 1")],
        )
    )
    assert created["flow_name"] == "Flow #1"

    updated = manager.update_flow(
        created["id"],
        PipelineFlowCreatePayload(
            flow_name="Flow #1 Updated",
            steps=[PipelineFlowStepPayload(type="custom", label="Run 2", command="echo 2")],
        ),
    )
    assert updated["flow_name"] == "Flow #1 Updated"
    assert updated["steps"][0]["command"] == "echo 2"

    deleted = manager.delete_flow(created["id"])
    assert deleted["deleted"] is True
