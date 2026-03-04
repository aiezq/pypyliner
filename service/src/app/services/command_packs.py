from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from src.app.core.constants import (
    CUSTOM_COMMAND_PACK_FILE,
    DEFAULT_COMMAND_PACK_FILE,
    PIPELINE_OPEN_TERMINAL_COMMAND,
)
from src.app.schemas.command_pack import (
    CommandPackFilePayload,
    CommandPackImportPayload,
    CommandTemplateCreatePayload,
    CommandTemplateUpdatePayload,
)
from src.app.services.runtime import ServiceError

_IDENTIFIER_RE = re.compile(r"[^a-zA-Z0-9_-]+")
_SAFE_FILENAME_RE = re.compile(r"[^a-zA-Z0-9_.-]+")


class CommandPackManager:
    def __init__(self) -> None:
        self._default_pack_file = DEFAULT_COMMAND_PACK_FILE
        self._custom_pack_file = CUSTOM_COMMAND_PACK_FILE
        self._packs_dir = DEFAULT_COMMAND_PACK_FILE.parent

    async def ensure_ready(self) -> None:
        self._packs_dir.mkdir(parents=True, exist_ok=True)
        if self._default_pack_file.exists():
            return
        self._write_pack_file(self._default_pack_file, self._default_pack_payload())

    @staticmethod
    def _default_pack_payload() -> dict[str, Any]:
        return {
            "pack_id": "core",
            "pack_name": "Core Commands",
            "description": "Built-in command templates.",
            "commands": [
                {
                    "id": "open_terminal",
                    "name": "Open terminal shell",
                    "command": PIPELINE_OPEN_TERMINAL_COMMAND,
                    "description": "Создает новый интерактивный терминал в приложении.",
                },
                {
                    "id": "sync_repository",
                    "name": "Sync repository",
                    "command": "git pull --rebase",
                    "description": "Обновляет локальный репозиторий перед запуском сервиса.",
                },
                {
                    "id": "restart_service",
                    "name": "Restart service",
                    "command": "systemctl restart my-service",
                    "description": "Перезапускает системный сервис после обновления.",
                },
            ],
        }

    @staticmethod
    def _slugify(value: str, fallback: str) -> str:
        normalized = _IDENTIFIER_RE.sub("_", value.strip().lower()).strip("_")
        return normalized or fallback

    @staticmethod
    def _safe_file_name(value: str) -> str:
        raw = Path(value).name
        cleaned = _SAFE_FILENAME_RE.sub("_", raw).strip("._")
        if not cleaned:
            return "pack.json"
        return cleaned if cleaned.endswith(".json") else f"{cleaned}.json"

    @staticmethod
    def _normalize_pack_dict(raw_pack: dict[str, Any], source_name: str) -> dict[str, Any]:
        next_pack = dict(raw_pack)
        if "commands" not in next_pack and "templates" in next_pack:
            next_pack["commands"] = next_pack["templates"]
        if "pack_id" not in next_pack or not str(next_pack.get("pack_id", "")).strip():
            next_pack["pack_id"] = Path(source_name).stem
        if "pack_name" not in next_pack or not str(next_pack.get("pack_name", "")).strip():
            next_pack["pack_name"] = str(next_pack["pack_id"]).replace("_", " ").title()
        return next_pack

    def _validate_pack(self, raw_pack: dict[str, Any], source_name: str) -> CommandPackFilePayload:
        normalized = self._normalize_pack_dict(raw_pack, source_name)
        try:
            parsed = CommandPackFilePayload.model_validate(normalized)
        except Exception as error:  # pydantic validation error
            raise ServiceError(
                status_code=400,
                detail=f"Invalid command pack format in '{source_name}': {error}",
            ) from error

        pack_id = self._slugify(parsed.pack_id, Path(source_name).stem or "pack")
        commands = []
        used_ids: set[str] = set()
        for index, command in enumerate(parsed.commands, start=1):
            base_id = command.id or command.name or f"cmd_{index}"
            command_id = self._slugify(base_id, f"cmd_{index}")
            unique_id = command_id
            suffix = 2
            while unique_id in used_ids:
                unique_id = f"{command_id}_{suffix}"
                suffix += 1
            used_ids.add(unique_id)

            commands.append(
                {
                    "id": unique_id,
                    "name": command.name.strip(),
                    "command": command.command.strip(),
                    "description": command.description.strip(),
                }
            )

        return CommandPackFilePayload.model_validate(
            {
                "pack_id": pack_id,
                "pack_name": parsed.pack_name.strip(),
                "description": parsed.description.strip(),
                "commands": commands,
            }
        )

    @staticmethod
    def _write_pack_file(path: Path, pack: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(pack, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    @staticmethod
    def _read_json_file(path: Path) -> dict[str, Any]:
        try:
            content = path.read_text(encoding="utf-8")
            payload = json.loads(content)
        except FileNotFoundError as error:
            raise ServiceError(status_code=404, detail=f"Command pack file not found: {path.name}") from error
        except json.JSONDecodeError as error:
            raise ServiceError(status_code=400, detail=f"Invalid JSON in pack file '{path.name}': {error}") from error

        if not isinstance(payload, dict):
            raise ServiceError(status_code=400, detail=f"Pack file '{path.name}' must contain a JSON object")
        return payload

    def list_command_packs(self) -> dict[str, Any]:
        packs: list[dict[str, Any]] = []
        templates: list[dict[str, str]] = []
        errors: list[str] = []

        pack_files = sorted(self._packs_dir.glob("*.json"), key=lambda path: path.name)
        for file_path in pack_files:
            try:
                raw_pack = self._read_json_file(file_path)
                pack = self._validate_pack(raw_pack, file_path.name)
            except ServiceError as error:
                errors.append(error.detail)
                continue

            serialized_templates: list[dict[str, str]] = []
            for command in pack.commands:
                template = {
                    "id": f"{pack.pack_id}:{command.id}",
                    "name": command.name,
                    "command": command.command,
                    "description": command.description,
                }
                serialized_templates.append(template)
                templates.append(template)

            packs.append(
                {
                    "pack_id": pack.pack_id,
                    "pack_name": pack.pack_name,
                    "description": pack.description,
                    "file_name": file_path.name,
                    "templates": serialized_templates,
                }
            )

        return {"packs": packs, "templates": templates, "errors": errors}

    def create_template(self, payload: CommandTemplateCreatePayload) -> dict[str, Any]:
        target_pack_id = self._slugify(payload.pack_id or "custom", "custom")
        target_file = self._custom_pack_file if target_pack_id == "custom" else self._packs_dir / f"{target_pack_id}.json"

        if target_file.exists():
            raw_pack = self._read_json_file(target_file)
            parsed_pack = self._validate_pack(raw_pack, target_file.name)
            pack_commands = [
                {
                    "id": item.id,
                    "name": item.name,
                    "command": item.command,
                    "description": item.description,
                }
                for item in parsed_pack.commands
            ]
            pack_name = parsed_pack.pack_name
            description = parsed_pack.description
        else:
            pack_commands = []
            pack_name = "Custom Commands" if target_pack_id == "custom" else target_pack_id.replace("_", " ").title()
            description = "User-defined command templates."

        base_command_id = self._slugify(payload.name, "cmd")
        next_command_id = base_command_id
        used_command_ids = {item["id"] for item in pack_commands}
        suffix = 2
        while next_command_id in used_command_ids:
            next_command_id = f"{base_command_id}_{suffix}"
            suffix += 1

        next_command = {
            "id": next_command_id,
            "name": payload.name.strip(),
            "command": payload.command.strip(),
            "description": payload.description.strip() or "User-defined template command.",
        }
        pack_commands.append(next_command)

        pack_payload = CommandPackFilePayload.model_validate(
            {
                "pack_id": target_pack_id,
                "pack_name": pack_name,
                "description": description,
                "commands": pack_commands,
            }
        ).model_dump()
        self._write_pack_file(target_file, pack_payload)

        return {
            "id": f"{target_pack_id}:{next_command_id}",
            "name": next_command["name"],
            "command": next_command["command"],
            "description": next_command["description"],
            "pack_id": target_pack_id,
            "pack_file": target_file.name,
        }

    @staticmethod
    def _split_template_id(template_id: str) -> tuple[str, str]:
        raw = template_id.strip()
        if ":" not in raw:
            raise ServiceError(
                status_code=400,
                detail="Invalid template id. Expected format '<pack_id>:<template_id>'.",
            )
        pack_id, command_id = raw.split(":", 1)
        pack = pack_id.strip()
        command = command_id.strip()
        if not pack or not command:
            raise ServiceError(
                status_code=400,
                detail="Invalid template id. Expected format '<pack_id>:<template_id>'.",
            )
        return pack, command

    def _find_pack_file(self, pack_id: str) -> tuple[Path, CommandPackFilePayload]:
        for file_path in sorted(self._packs_dir.glob("*.json"), key=lambda path: path.name):
            try:
                raw_pack = self._read_json_file(file_path)
                parsed_pack = self._validate_pack(raw_pack, file_path.name)
            except ServiceError:
                continue
            if parsed_pack.pack_id == pack_id:
                return file_path, parsed_pack

        raise ServiceError(
            status_code=404,
            detail=f"Command pack '{pack_id}' not found.",
        )

    def update_template(self, template_id: str, payload: CommandTemplateUpdatePayload) -> dict[str, Any]:
        pack_id, command_id = self._split_template_id(template_id)
        if payload.name is None and payload.command is None:
            raise ServiceError(
                status_code=400,
                detail="Nothing to update. Provide 'name' and/or 'command'.",
            )

        target_file, parsed_pack = self._find_pack_file(pack_id)
        updated_commands: list[dict[str, str]] = []
        updated_template: dict[str, str] | None = None

        for command in parsed_pack.commands:
            next_name = command.name
            next_command = command.command
            if command.id == command_id:
                if payload.name is not None:
                    candidate_name = payload.name.strip()
                    if not candidate_name:
                        raise ServiceError(status_code=400, detail="Template name cannot be empty.")
                    next_name = candidate_name
                if payload.command is not None:
                    candidate_command = payload.command.strip()
                    if not candidate_command:
                        raise ServiceError(status_code=400, detail="Template command cannot be empty.")
                    next_command = candidate_command
                updated_template = {
                    "id": command.id or command_id,
                    "name": next_name,
                    "command": next_command,
                    "description": command.description,
                }

            updated_commands.append(
                {
                    "id": command.id or command_id,
                    "name": next_name,
                    "command": next_command,
                    "description": command.description,
                }
            )

        if updated_template is None:
            raise ServiceError(
                status_code=404,
                detail=f"Template '{command_id}' not found in pack '{pack_id}'.",
            )

        updated_pack = CommandPackFilePayload.model_validate(
            {
                "pack_id": parsed_pack.pack_id,
                "pack_name": parsed_pack.pack_name,
                "description": parsed_pack.description,
                "commands": updated_commands,
            }
        ).model_dump()
        self._write_pack_file(target_file, updated_pack)

        return {
            "id": f"{pack_id}:{updated_template['id']}",
            "name": updated_template["name"],
            "command": updated_template["command"],
            "description": updated_template["description"],
            "pack_id": pack_id,
            "pack_file": target_file.name,
        }

    def delete_template(self, template_id: str) -> dict[str, Any]:
        pack_id, command_id = self._split_template_id(template_id)
        target_file, parsed_pack = self._find_pack_file(pack_id)

        commands = [
            {
                "id": item.id or "",
                "name": item.name,
                "command": item.command,
                "description": item.description,
            }
            for item in parsed_pack.commands
        ]

        command_index = next(
            (index for index, item in enumerate(commands) if item["id"] == command_id),
            -1,
        )
        if command_index < 0:
            raise ServiceError(
                status_code=404,
                detail=f"Template '{command_id}' not found in pack '{pack_id}'.",
            )

        if target_file == self._default_pack_file and len(commands) <= 1:
            raise ServiceError(
                status_code=409,
                detail="Cannot delete the last template from the core command pack.",
            )

        del commands[command_index]
        if commands:
            next_pack_payload = CommandPackFilePayload.model_validate(
                {
                    "pack_id": parsed_pack.pack_id,
                    "pack_name": parsed_pack.pack_name,
                    "description": parsed_pack.description,
                    "commands": commands,
                }
            ).model_dump()
            self._write_pack_file(target_file, next_pack_payload)
        else:
            target_file.unlink(missing_ok=True)

        return {
            "deleted": True,
            "template_id": template_id,
            "pack_id": pack_id,
            "pack_file": target_file.name,
        }

    def move_template(self, template_id: str, target_pack_id: str) -> dict[str, Any]:
        source_pack_id, source_command_id = self._split_template_id(template_id)
        normalized_target_pack_id = self._slugify(target_pack_id, "custom")

        source_file, source_pack = self._find_pack_file(source_pack_id)
        source_commands = [
            {
                "id": item.id or "",
                "name": item.name,
                "command": item.command,
                "description": item.description,
            }
            for item in source_pack.commands
        ]

        source_index = next(
            (index for index, item in enumerate(source_commands) if item["id"] == source_command_id),
            -1,
        )
        if source_index < 0:
            raise ServiceError(
                status_code=404,
                detail=f"Template '{source_command_id}' not found in pack '{source_pack_id}'.",
            )

        command_to_move = source_commands[source_index]
        if source_pack_id == normalized_target_pack_id:
            return {
                "id": f"{source_pack_id}:{command_to_move['id']}",
                "name": command_to_move["name"],
                "command": command_to_move["command"],
                "description": command_to_move["description"],
                "pack_id": source_pack_id,
                "pack_file": source_file.name,
            }
        if source_file == self._default_pack_file and len(source_commands) <= 1:
            raise ServiceError(
                status_code=409,
                detail="Cannot move the last template from the core command pack.",
            )

        target_file = (
            self._custom_pack_file
            if normalized_target_pack_id == "custom"
            else self._packs_dir / f"{normalized_target_pack_id}.json"
        )
        if target_file.exists():
            target_raw_pack = self._read_json_file(target_file)
            target_pack = self._validate_pack(target_raw_pack, target_file.name)
            target_commands = [
                {
                    "id": item.id or "",
                    "name": item.name,
                    "command": item.command,
                    "description": item.description,
                }
                for item in target_pack.commands
            ]
            target_pack_name = target_pack.pack_name
            target_pack_description = target_pack.description
        else:
            target_commands = []
            target_pack_name = (
                "Custom Commands"
                if normalized_target_pack_id == "custom"
                else normalized_target_pack_id.replace("_", " ").title()
            )
            target_pack_description = "User-defined command templates."

        candidate_command_id = self._slugify(command_to_move["id"], "cmd")
        used_target_ids = {item["id"] for item in target_commands}
        next_command_id = candidate_command_id
        suffix = 2
        while next_command_id in used_target_ids:
            next_command_id = f"{candidate_command_id}_{suffix}"
            suffix += 1

        moved_command = {
            "id": next_command_id,
            "name": command_to_move["name"],
            "command": command_to_move["command"],
            "description": command_to_move["description"],
        }
        target_commands.append(moved_command)

        target_payload = CommandPackFilePayload.model_validate(
            {
                "pack_id": normalized_target_pack_id,
                "pack_name": target_pack_name,
                "description": target_pack_description,
                "commands": target_commands,
            }
        ).model_dump()
        self._write_pack_file(target_file, target_payload)

        del source_commands[source_index]
        if source_commands:
            source_payload = CommandPackFilePayload.model_validate(
                {
                    "pack_id": source_pack.pack_id,
                    "pack_name": source_pack.pack_name,
                    "description": source_pack.description,
                    "commands": source_commands,
                }
            ).model_dump()
            self._write_pack_file(source_file, source_payload)
        else:
            source_file.unlink(missing_ok=True)

        return {
            "id": f"{normalized_target_pack_id}:{moved_command['id']}",
            "name": moved_command["name"],
            "command": moved_command["command"],
            "description": moved_command["description"],
            "pack_id": normalized_target_pack_id,
            "pack_file": target_file.name,
            "moved_from_pack_id": source_pack_id,
        }

    def import_pack(self, payload: CommandPackImportPayload) -> dict[str, Any]:
        try:
            raw_json = json.loads(payload.content)
        except json.JSONDecodeError as error:
            raise ServiceError(status_code=400, detail=f"Invalid JSON: {error}") from error
        if not isinstance(raw_json, dict):
            raise ServiceError(status_code=400, detail="Import payload must contain a JSON object")

        parsed_pack = self._validate_pack(raw_json, payload.file_name or "import.json")
        file_name = payload.file_name or f"{parsed_pack.pack_id}.json"
        safe_name = self._safe_file_name(file_name)
        file_path = self._packs_dir / safe_name

        self._write_pack_file(file_path, parsed_pack.model_dump())
        return {
            "imported": True,
            "pack_id": parsed_pack.pack_id,
            "pack_name": parsed_pack.pack_name,
            "file_name": safe_name,
            "commands_count": len(parsed_pack.commands),
        }
