from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, cast


class BootstrapDiagnostics:
    def __init__(self, *, logger: logging.Logger, entity_name: str) -> None:
        self._logger = logger
        self._entity_name = entity_name
        self._errors: list[str] = []

    def reset(self) -> None:
        self._errors = []

    def record(self, file_path: Path, reason: str) -> None:
        message = f"{file_path.name}: {reason}"
        self._errors.append(message)
        self._logger.warning("Skipping %s bootstrap file %s: %s", self._entity_name, file_path, reason)

    def snapshot(self) -> list[str]:
        return list(self._errors)


def load_bootstrap_json_object(
    file_path: Path,
    diagnostics: BootstrapDiagnostics,
) -> dict[str, Any] | None:
    try:
        raw_data: object = json.loads(file_path.read_text(encoding="utf-8"))
    except OSError as error:
        diagnostics.record(file_path, f"failed to read file: {error}")
        return None
    except json.JSONDecodeError as error:
        diagnostics.record(file_path, f"invalid JSON: {error}")
        return None

    if not isinstance(raw_data, dict):
        diagnostics.record(file_path, "top-level payload must be a JSON object")
        return None

    return cast(dict[str, Any], raw_data)
