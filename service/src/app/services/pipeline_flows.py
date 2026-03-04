from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.app.core.constants import PIPELINE_FLOWS_DIR
from src.app.schemas.pipeline_flow import (
    PipelineFlowCreatePayload,
    PipelineFlowFilePayload,
)
from src.app.services.runtime import ServiceError

_IDENTIFIER_RE = re.compile(r"[^a-zA-Z0-9_-]+")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class PipelineFlowManager:
    def __init__(self) -> None:
        self._flows_dir = PIPELINE_FLOWS_DIR

    async def ensure_ready(self) -> None:
        self._flows_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _slugify(value: str, fallback: str) -> str:
        normalized = _IDENTIFIER_RE.sub("_", value.strip().lower()).strip("_")
        return normalized or fallback

    @staticmethod
    def _read_json_file(path: Path) -> dict[str, Any]:
        try:
            content = path.read_text(encoding="utf-8")
            payload = json.loads(content)
        except FileNotFoundError as error:
            raise ServiceError(status_code=404, detail=f"Pipeline flow file not found: {path.name}") from error
        except json.JSONDecodeError as error:
            raise ServiceError(status_code=400, detail=f"Invalid JSON in pipeline flow file '{path.name}': {error}") from error

        if not isinstance(payload, dict):
            raise ServiceError(status_code=400, detail=f"Pipeline flow file '{path.name}' must contain a JSON object")
        return payload

    @staticmethod
    def _write_json_file(path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    def _normalize_flow_dict(self, raw_flow: dict[str, Any], source_name: str) -> dict[str, Any]:
        next_flow = dict(raw_flow)
        source_stem = Path(source_name).stem
        if "flow_id" not in next_flow:
            if "id" in next_flow:
                next_flow["flow_id"] = next_flow["id"]
            else:
                next_flow["flow_id"] = source_stem
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

        flow_id = self._slugify(parsed.flow_id, Path(source_name).stem or "flow")
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
    def _serialize_flow(flow: PipelineFlowFilePayload, file_name: str) -> dict[str, Any]:
        return {
            "id": flow.flow_id,
            "flow_name": flow.flow_name,
            "created_at": flow.created_at,
            "updated_at": flow.updated_at,
            "file_name": file_name,
            "steps": [step.model_dump() for step in flow.steps],
        }

    def _flow_path(self, flow_id: str) -> Path:
        normalized_id = self._slugify(flow_id, "flow")
        return self._flows_dir / f"{normalized_id}.json"

    def list_flows(self) -> dict[str, Any]:
        flows: list[dict[str, Any]] = []
        errors: list[str] = []

        flow_files = sorted(self._flows_dir.glob("*.json"), key=lambda path: path.name)
        for file_path in flow_files:
            try:
                raw_flow = self._read_json_file(file_path)
                parsed_flow = self._validate_flow(raw_flow, file_path.name)
            except ServiceError as error:
                errors.append(error.detail)
                continue
            flows.append(self._serialize_flow(parsed_flow, file_path.name))

        flows.sort(key=lambda item: item["updated_at"], reverse=True)
        return {"flows": flows, "errors": errors}

    def create_flow(self, payload: PipelineFlowCreatePayload) -> dict[str, Any]:
        base_flow_id = self._slugify(payload.flow_name, "flow")
        next_flow_id = base_flow_id
        suffix = 2
        while self._flow_path(next_flow_id).exists():
            next_flow_id = f"{base_flow_id}_{suffix}"
            suffix += 1

        timestamp = _now_iso()
        file_payload = PipelineFlowFilePayload.model_validate(
            {
                "flow_id": next_flow_id,
                "flow_name": payload.flow_name.strip(),
                "created_at": timestamp,
                "updated_at": timestamp,
                "steps": [step.model_dump() for step in payload.steps],
            }
        ).model_dump()

        target_path = self._flow_path(next_flow_id)
        self._write_json_file(target_path, file_payload)
        parsed_payload = PipelineFlowFilePayload.model_validate(file_payload)
        return self._serialize_flow(parsed_payload, target_path.name)

    def update_flow(self, flow_id: str, payload: PipelineFlowCreatePayload) -> dict[str, Any]:
        target_path = self._flow_path(flow_id)
        if not target_path.exists():
            raise ServiceError(status_code=404, detail=f"Pipeline flow '{flow_id}' not found.")

        raw_existing = self._read_json_file(target_path)
        parsed_existing = self._validate_flow(raw_existing, target_path.name)

        updated_payload = PipelineFlowFilePayload.model_validate(
            {
                "flow_id": parsed_existing.flow_id,
                "flow_name": payload.flow_name.strip(),
                "created_at": parsed_existing.created_at,
                "updated_at": _now_iso(),
                "steps": [step.model_dump() for step in payload.steps],
            }
        ).model_dump()
        self._write_json_file(target_path, updated_payload)
        parsed_updated = PipelineFlowFilePayload.model_validate(updated_payload)
        return self._serialize_flow(parsed_updated, target_path.name)

    def delete_flow(self, flow_id: str) -> dict[str, Any]:
        target_path = self._flow_path(flow_id)
        if not target_path.exists():
            raise ServiceError(status_code=404, detail=f"Pipeline flow '{flow_id}' not found.")
        target_path.unlink(missing_ok=True)
        return {"deleted": True, "flow_id": self._slugify(flow_id, "flow")}
