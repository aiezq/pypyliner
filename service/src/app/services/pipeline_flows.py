from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypeAlias, cast

from sqlalchemy import delete, desc
from sqlmodel import Session, select

from src.app.core import database as database_module
from src.app.core.settings import get_settings
from src.app.models.db import PipelineFlowRecord, PipelineFlowStepRecord
from src.app.schemas.pipeline_flow import (
    PipelineFlowCreatePayload,
    PipelineFlowFilePayload,
)
from src.app.schemas.service_types import (
    PipelineFlowData,
    PipelineFlowDeleteData,
    PipelineFlowListData,
)
from src.app.services.runtime import ServiceError
from src.app.services.bootstrap_diagnostics import BootstrapDiagnostics, load_bootstrap_json_object

_IDENTIFIER_RE = re.compile(r"[^a-zA-Z0-9_-]+")
JsonObject: TypeAlias = dict[str, Any]
FLOW_UPDATED_AT_COLUMN: Any = cast(Any, PipelineFlowRecord).updated_at
STEP_FLOW_ID_COLUMN: Any = cast(Any, PipelineFlowStepRecord).flow_id
STEP_POSITION_COLUMN: Any = cast(Any, PipelineFlowStepRecord).position
LOGGER = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class PipelineFlowManager:
    def __init__(self) -> None:
        settings = get_settings()
        self._bundled_flows_dir = Path(settings.service_dir) / "pipeline_flows"
        self._legacy_flows_dir = settings.pipeline_flows_dir
        self._bootstrap_diagnostics = BootstrapDiagnostics(logger=LOGGER, entity_name="pipeline flow")

    @staticmethod
    def _collect_bootstrap_dirs(*directories: Path) -> list[Path]:
        unique_dirs: list[Path] = []
        seen: set[Path] = set()
        for directory in directories:
            resolved = directory.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            unique_dirs.append(directory)
        return unique_dirs

    async def ensure_ready(self) -> None:
        with Session(database_module.engine) as session:
            existing = session.exec(select(PipelineFlowRecord).limit(1)).first()

            if existing is not None:
                return
            self._bootstrap_from_legacy_files(session)
            session.commit()

    def _bootstrap_from_legacy_files(self, session: Session) -> None:
        self._bootstrap_diagnostics.reset()
        for legacy_dir in self._collect_bootstrap_dirs(self._bundled_flows_dir, self._legacy_flows_dir):
            if not legacy_dir.exists():
                continue

            for file_path in sorted(legacy_dir.glob("*.json"), key=lambda path: path.name):
                raw_data = load_bootstrap_json_object(file_path, self._bootstrap_diagnostics)
                if raw_data is None:
                    continue
                raw_flow = raw_data

                try:
                    parsed = self._validate_flow(raw_flow, file_path.stem)
                except ServiceError as error:
                    self._bootstrap_diagnostics.record(file_path, error.detail)
                    continue

                flow = session.get(PipelineFlowRecord, parsed.flow_id)

                if flow is None:
                    flow = PipelineFlowRecord(
                        flow_id=parsed.flow_id,
                        flow_name=parsed.flow_name,
                        created_at=parsed.created_at,
                        updated_at=parsed.updated_at,
                    )
                    session.add(flow)
                else:
                    flow.flow_name = parsed.flow_name
                    flow.created_at = parsed.created_at
                    flow.updated_at = parsed.updated_at

                existing_steps = session.exec(
                    select(PipelineFlowStepRecord).where(
                        STEP_FLOW_ID_COLUMN == parsed.flow_id
                    )
                ).all()
                step_records = cast(list[PipelineFlowStepRecord], existing_steps)
                for step in step_records:
                    session.delete(step)

                for position, step in enumerate(parsed.steps, start=1):
                    session.add(
                        PipelineFlowStepRecord(
                            flow_id=parsed.flow_id,
                            position=position,
                            step_type=step.type,
                            label=step.label,
                            command=step.command,
                        )
                    )

    @staticmethod
    def _slugify(value: str, fallback: str) -> str:
        normalized = _IDENTIFIER_RE.sub("_", value.strip().lower()).strip("_")
        return normalized or fallback

    def _normalize_flow_dict(self, raw_flow: dict[str, Any], source_name: str) -> dict[str, Any]:
        next_flow = dict(raw_flow)
        if "flow_id" not in next_flow:
            if "id" in next_flow:
                next_flow["flow_id"] = next_flow["id"]
            else:
                next_flow["flow_id"] = source_name
        if "flow_name" not in next_flow:
            if "name" in next_flow:
                next_flow["flow_name"] = next_flow["name"]
            elif "pipeline_name" in next_flow:
                next_flow["flow_name"] = next_flow["pipeline_name"]
            else:
                next_flow["flow_name"] = str(next_flow["flow_id"]).replace("_", " ").title()
        if "steps" not in next_flow:
            next_flow["steps"] = []
        if "created_at" not in next_flow or not str(next_flow.get("created_at", "")).strip():
            next_flow["created_at"] = _now_iso()
        if "updated_at" not in next_flow or not str(next_flow.get("updated_at", "")).strip():
            next_flow["updated_at"] = next_flow["created_at"]
        return next_flow

    def _validate_flow(self, raw_flow: dict[str, Any], source_name: str) -> PipelineFlowFilePayload:
        normalized = self._normalize_flow_dict(raw_flow, source_name)
        try:
            parsed = PipelineFlowFilePayload.model_validate(normalized)
        except Exception as error:
            raise ServiceError(
                status_code=400,
                detail=f"Invalid pipeline flow format in '{source_name}': {error}",
            ) from error

        flow_id = self._slugify(parsed.flow_id, self._slugify(source_name, "flow"))
        return PipelineFlowFilePayload.model_validate(
            {
                "flow_id": flow_id,
                "flow_name": parsed.flow_name.strip(),
                "created_at": parsed.created_at,
                "updated_at": parsed.updated_at,
                "steps": [item.model_dump() for item in parsed.steps],
            }
        )

    @staticmethod
    def _serialize_flow(
        flow: PipelineFlowRecord,
        steps: list[PipelineFlowStepRecord],
    ) -> PipelineFlowData:
        return {
            "id": flow.flow_id,
            "flow_name": flow.flow_name,
            "created_at": flow.created_at,
            "updated_at": flow.updated_at,
            "file_name": f"{flow.flow_id}.json",
            "steps": [
                {
                    "type": step.step_type,
                    "label": step.label,
                    "command": step.command,
                }
                for step in steps
            ],
        }

    def _normalized_flow_id(self, flow_id: str) -> str:
        return self._slugify(flow_id, "flow")

    def list_flows(self) -> PipelineFlowListData:
        flows: list[PipelineFlowData] = []
        errors = self._bootstrap_diagnostics.snapshot()

        with Session(database_module.engine) as session:
            flow_rows = session.exec(
                select(PipelineFlowRecord).order_by(desc(FLOW_UPDATED_AT_COLUMN))
            ).all()
            flow_records = cast(list[PipelineFlowRecord], flow_rows)

            for flow in flow_records:
                step_rows = session.exec(
                    select(PipelineFlowStepRecord)
                    .where(STEP_FLOW_ID_COLUMN == flow.flow_id)
                    .order_by(STEP_POSITION_COLUMN)
                ).all()
                serialized_steps = cast(list[PipelineFlowStepRecord], step_rows)
                flows.append(self._serialize_flow(flow, serialized_steps))

        return {"flows": flows, "errors": errors}

    def create_flow(self, payload: PipelineFlowCreatePayload) -> PipelineFlowData:
        base_flow_id = self._slugify(payload.flow_name, "flow")
        timestamp = _now_iso()

        with Session(database_module.engine) as session:
            next_flow_id = base_flow_id
            suffix = 2
            while session.get(PipelineFlowRecord, next_flow_id) is not None:
                next_flow_id = f"{base_flow_id}_{suffix}"
                suffix += 1

            parsed_payload = PipelineFlowFilePayload.model_validate(
                {
                    "flow_id": next_flow_id,
                    "flow_name": payload.flow_name.strip(),
                    "created_at": timestamp,
                    "updated_at": timestamp,
                    "steps": [step.model_dump() for step in payload.steps],
                }
            )

            flow = PipelineFlowRecord(
                flow_id=parsed_payload.flow_id,
                flow_name=parsed_payload.flow_name,
                created_at=parsed_payload.created_at,
                updated_at=parsed_payload.updated_at,
            )
            session.add(flow)

            for position, step in enumerate(parsed_payload.steps, start=1):
                session.add(
                    PipelineFlowStepRecord(
                        flow_id=parsed_payload.flow_id,
                        position=position,
                        step_type=step.type,
                        label=step.label,
                        command=step.command,
                    )
                )

            session.commit()

            step_rows = session.exec(
                select(PipelineFlowStepRecord)
                .where(STEP_FLOW_ID_COLUMN == parsed_payload.flow_id)
                .order_by(STEP_POSITION_COLUMN)
            ).all()
            serialized_steps = cast(list[PipelineFlowStepRecord], step_rows)
            return self._serialize_flow(flow, serialized_steps)

    def update_flow(
        self,
        flow_id: str,
        payload: PipelineFlowCreatePayload,
    ) -> PipelineFlowData:
        normalized_flow_id = self._normalized_flow_id(flow_id)

        with Session(database_module.engine) as session:
            flow = session.get(PipelineFlowRecord, normalized_flow_id)
            if flow is None:
                raise ServiceError(status_code=404, detail=f"Pipeline flow '{flow_id}' not found.")

            updated_payload = PipelineFlowFilePayload.model_validate(
                {
                    "flow_id": flow.flow_id,
                    "flow_name": payload.flow_name.strip(),
                    "created_at": flow.created_at,
                    "updated_at": _now_iso(),
                    "steps": [step.model_dump() for step in payload.steps],
                }
            )

            flow.flow_name = updated_payload.flow_name
            flow.updated_at = updated_payload.updated_at

            existing_steps = session.exec(
                select(PipelineFlowStepRecord).where(
                    STEP_FLOW_ID_COLUMN == flow.flow_id
                )
            ).all()
            step_records = cast(list[PipelineFlowStepRecord], existing_steps)
            for step in step_records:
                session.delete(step)

            for position, step in enumerate(updated_payload.steps, start=1):
                session.add(
                    PipelineFlowStepRecord(
                        flow_id=flow.flow_id,
                        position=position,
                        step_type=step.type,
                        label=step.label,
                        command=step.command,
                    )
                )

            session.commit()

            step_rows = session.exec(
                select(PipelineFlowStepRecord)
                .where(STEP_FLOW_ID_COLUMN == flow.flow_id)
                .order_by(STEP_POSITION_COLUMN)
            ).all()
            serialized_steps = cast(list[PipelineFlowStepRecord], step_rows)
            return self._serialize_flow(flow, serialized_steps)

    def delete_flow(self, flow_id: str) -> PipelineFlowDeleteData:
        normalized_flow_id = self._normalized_flow_id(flow_id)

        with Session(database_module.engine) as session:
            flow = session.get(PipelineFlowRecord, normalized_flow_id)
            if flow is None:
                raise ServiceError(status_code=404, detail=f"Pipeline flow '{flow_id}' not found.")

            session.exec(
                delete(PipelineFlowStepRecord).where(
                    STEP_FLOW_ID_COLUMN == normalized_flow_id
                )
            )
            session.delete(flow)
            session.commit()

        return {"deleted": True, "flow_id": normalized_flow_id}
