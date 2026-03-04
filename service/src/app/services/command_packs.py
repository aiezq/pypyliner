from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypeAlias, cast

from sqlmodel import Session, select

from src.app.core.constants import PIPELINE_OPEN_TERMINAL_COMMAND
from src.app.core.database import session_scope
from src.app.core.settings import get_settings
from src.app.models.db import CommandPackRecord, CommandTemplateRecord
from src.app.schemas.command_pack import (
    CommandPackFilePayload,
    CommandPackImportPayload,
    CommandTemplateCreatePayload,
    CommandTemplateUpdatePayload,
)
from src.app.schemas.service_types import (
    CommandPackData,
    CommandPackImportData,
    CommandPackListData,
    CommandTemplateData,
    CommandTemplateDeleteData,
    CommandTemplateMutationData,
)
from src.app.services.runtime import ServiceError

_IDENTIFIER_RE = re.compile(r"[^a-zA-Z0-9_-]+")
_SAFE_FILENAME_RE = re.compile(r"[^a-zA-Z0-9_.-]+")
JsonObject: TypeAlias = dict[str, Any]
CommandItem: TypeAlias = dict[str, str]
TEMPLATE_POSITION_COLUMN: Any = cast(Any, CommandTemplateRecord).position


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class CommandPackManager:
    def __init__(self) -> None:
        self._legacy_packs_dir = get_settings().command_packs_dir

    async def ensure_ready(self) -> None:
        with session_scope() as session:
            existing = session.exec(select(CommandPackRecord.pack_id)).first()
            if existing is None:
                self._bootstrap_from_legacy_files(session)

            core = session.get(CommandPackRecord, "core")
            if core is None:
                self._insert_core_pack(session)
                session.commit()

    def _insert_core_pack(self, session: Session) -> None:
        payload = self._default_pack_payload()
        parsed = CommandPackFilePayload.model_validate(payload)
        timestamp = _now_iso()
        session.add(
            CommandPackRecord(
                pack_id="core",
                pack_name=parsed.pack_name,
                description=parsed.description,
                source_name="default.json",
                is_core=True,
                updated_at=timestamp,
            )
        )
        for index, item in enumerate(parsed.commands, start=1):
            session.add(
                CommandTemplateRecord(
                    pack_id="core",
                    template_id=item.id or f"cmd_{index}",
                    name=item.name,
                    command=item.command,
                    description=item.description,
                    position=index,
                )
            )

    def _bootstrap_from_legacy_files(self, session: Session) -> None:
        legacy_dir = self._legacy_packs_dir
        if not legacy_dir.exists():
            return

        imported = False
        for file_path in sorted(legacy_dir.glob("*.json"), key=lambda path: path.name):
            try:
                raw_pack = json.loads(file_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if not isinstance(raw_pack, dict):
                continue

            try:
                parsed = self._validate_pack(cast(JsonObject, raw_pack), file_path.name)
            except ServiceError:
                continue

            imported = True
            pack = session.get(CommandPackRecord, parsed.pack_id)
            if pack is None:
                pack = CommandPackRecord(
                    pack_id=parsed.pack_id,
                    pack_name=parsed.pack_name,
                    description=parsed.description,
                    source_name=file_path.name,
                    is_core=parsed.pack_id == "core",
                    updated_at=_now_iso(),
                )
                session.add(pack)
            else:
                pack.pack_name = parsed.pack_name
                pack.description = parsed.description
                pack.source_name = file_path.name
                pack.is_core = pack.pack_id == "core"
                pack.updated_at = _now_iso()

            existing_templates = session.exec(
                select(CommandTemplateRecord).where(CommandTemplateRecord.pack_id == parsed.pack_id)
            ).all()
            for item in existing_templates:
                session.delete(item)

            for index, item in enumerate(parsed.commands, start=1):
                session.add(
                    CommandTemplateRecord(
                        pack_id=parsed.pack_id,
                        template_id=item.id or f"cmd_{index}",
                        name=item.name,
                        command=item.command,
                        description=item.description,
                        position=index,
                    )
                )

        if imported:
            session.commit()

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
        commands: list[CommandItem] = []
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
    def _fetch_templates(pack_id: str) -> list[CommandTemplateRecord]:
        with session_scope() as session:
            return list(
                session.exec(
                    select(CommandTemplateRecord)
                    .where(CommandTemplateRecord.pack_id == pack_id)
                    .order_by(TEMPLATE_POSITION_COLUMN)
                ).all()
            )

    def list_command_packs(self) -> CommandPackListData:
        packs: list[CommandPackData] = []
        templates: list[CommandTemplateData] = []
        errors: list[str] = []

        with session_scope() as session:
            pack_rows = session.exec(
                select(CommandPackRecord).order_by(CommandPackRecord.pack_name)
            ).all()

            for pack in pack_rows:
                template_rows = session.exec(
                    select(CommandTemplateRecord)
                    .where(CommandTemplateRecord.pack_id == pack.pack_id)
                    .order_by(TEMPLATE_POSITION_COLUMN)
                ).all()

                serialized_templates: list[CommandTemplateData] = []
                for command in template_rows:
                    template: CommandTemplateData = {
                        "id": f"{pack.pack_id}:{command.template_id}",
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
                        "file_name": pack.source_name,
                        "templates": serialized_templates,
                    }
                )

        return {"packs": packs, "templates": templates, "errors": errors}

    def create_template(self, payload: CommandTemplateCreatePayload) -> CommandTemplateMutationData:
        target_pack_id = self._slugify(payload.pack_id or "custom", "custom")

        with session_scope() as session:
            pack = session.get(CommandPackRecord, target_pack_id)
            if pack is None:
                pack_name = "Custom Commands" if target_pack_id == "custom" else target_pack_id.replace("_", " ").title()
                pack = CommandPackRecord(
                    pack_id=target_pack_id,
                    pack_name=pack_name,
                    description="User-defined command templates.",
                    source_name=f"{target_pack_id}.json",
                    is_core=False,
                    updated_at=_now_iso(),
                )
                session.add(pack)
                template_rows: list[CommandTemplateRecord] = []
            else:
                template_rows = list(
                    session.exec(
                        select(CommandTemplateRecord)
                        .where(CommandTemplateRecord.pack_id == pack.pack_id)
                        .order_by(TEMPLATE_POSITION_COLUMN)
                    ).all()
                )

            base_command_id = self._slugify(payload.name, "cmd")
            next_command_id = base_command_id
            used_command_ids = {item.template_id for item in template_rows}
            suffix = 2
            while next_command_id in used_command_ids:
                next_command_id = f"{base_command_id}_{suffix}"
                suffix += 1

            next_template = CommandTemplateRecord(
                pack_id=pack.pack_id,
                template_id=next_command_id,
                name=payload.name.strip(),
                command=payload.command.strip(),
                description=payload.description.strip() or "User-defined template command.",
                position=len(template_rows) + 1,
            )
            session.add(next_template)
            pack.updated_at = _now_iso()
            session.commit()

            return {
                "id": f"{target_pack_id}:{next_command_id}",
                "name": next_template.name,
                "command": next_template.command,
                "description": next_template.description,
                "pack_id": target_pack_id,
                "pack_file": pack.source_name,
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

    @staticmethod
    def _find_pack(session: Session, pack_id: str) -> CommandPackRecord:
        pack = session.get(CommandPackRecord, pack_id)
        if pack is None:
            raise ServiceError(
                status_code=404,
                detail=f"Command pack '{pack_id}' not found.",
            )
        return pack

    def update_template(
        self,
        template_id: str,
        payload: CommandTemplateUpdatePayload,
    ) -> CommandTemplateMutationData:
        pack_id, command_id = self._split_template_id(template_id)
        if payload.name is None and payload.command is None:
            raise ServiceError(
                status_code=400,
                detail="Nothing to update. Provide 'name' and/or 'command'.",
            )

        with session_scope() as session:
            pack = self._find_pack(session, pack_id)
            command = session.exec(
                select(CommandTemplateRecord)
                .where(CommandTemplateRecord.pack_id == pack_id)
                .where(CommandTemplateRecord.template_id == command_id)
            ).first()
            if command is None:
                raise ServiceError(
                    status_code=404,
                    detail=f"Template '{command_id}' not found in pack '{pack_id}'.",
                )

            if payload.name is not None:
                candidate_name = payload.name.strip()
                if not candidate_name:
                    raise ServiceError(status_code=400, detail="Template name cannot be empty.")
                command.name = candidate_name

            if payload.command is not None:
                candidate_command = payload.command.strip()
                if not candidate_command:
                    raise ServiceError(status_code=400, detail="Template command cannot be empty.")
                command.command = candidate_command

            pack.updated_at = _now_iso()
            session.commit()

            return {
                "id": f"{pack_id}:{command.template_id}",
                "name": command.name,
                "command": command.command,
                "description": command.description,
                "pack_id": pack_id,
                "pack_file": pack.source_name,
            }

    def delete_template(self, template_id: str) -> CommandTemplateDeleteData:
        pack_id, command_id = self._split_template_id(template_id)

        with session_scope() as session:
            pack = self._find_pack(session, pack_id)
            commands = session.exec(
                select(CommandTemplateRecord)
                .where(CommandTemplateRecord.pack_id == pack_id)
                .order_by(TEMPLATE_POSITION_COLUMN)
            ).all()
            commands = list(commands)

            command_index = next(
                (index for index, item in enumerate(commands) if item.template_id == command_id),
                -1,
            )
            if command_index < 0:
                raise ServiceError(
                    status_code=404,
                    detail=f"Template '{command_id}' not found in pack '{pack_id}'.",
                )

            if pack.is_core and len(commands) <= 1:
                raise ServiceError(
                    status_code=409,
                    detail="Cannot delete the last template from the core command pack.",
                )

            target = commands[command_index]
            session.delete(target)

            for position, item in enumerate(commands[:command_index] + commands[command_index + 1 :], start=1):
                item.position = position

            if not pack.is_core and len(commands) == 1:
                session.delete(pack)
            else:
                pack.updated_at = _now_iso()

            session.commit()

            return {
                "deleted": True,
                "template_id": template_id,
                "pack_id": pack_id,
                "pack_file": pack.source_name,
            }

    def move_template(
        self,
        template_id: str,
        target_pack_id: str,
    ) -> CommandTemplateMutationData:
        source_pack_id, source_command_id = self._split_template_id(template_id)
        normalized_target_pack_id = self._slugify(target_pack_id, "custom")

        with session_scope() as session:
            source_pack = self._find_pack(session, source_pack_id)
            source_commands = session.exec(
                select(CommandTemplateRecord)
                .where(CommandTemplateRecord.pack_id == source_pack_id)
                .order_by(TEMPLATE_POSITION_COLUMN)
            ).all()
            source_commands = list(source_commands)

            source_command = next((item for item in source_commands if item.template_id == source_command_id), None)
            if source_command is None:
                raise ServiceError(
                    status_code=404,
                    detail=f"Template '{source_command_id}' not found in pack '{source_pack_id}'.",
                )

            if source_pack_id == normalized_target_pack_id:
                return {
                    "id": f"{source_pack_id}:{source_command.template_id}",
                    "name": source_command.name,
                    "command": source_command.command,
                    "description": source_command.description,
                    "pack_id": source_pack_id,
                    "pack_file": source_pack.source_name,
                }

            if source_pack.is_core and len(source_commands) <= 1:
                raise ServiceError(
                    status_code=409,
                    detail="Cannot move the last template from the core command pack.",
                )

            target_pack = session.get(CommandPackRecord, normalized_target_pack_id)
            if target_pack is None:
                target_pack = CommandPackRecord(
                    pack_id=normalized_target_pack_id,
                    pack_name=(
                        "Custom Commands"
                        if normalized_target_pack_id == "custom"
                        else normalized_target_pack_id.replace("_", " ").title()
                    ),
                    description="User-defined command templates.",
                    source_name=f"{normalized_target_pack_id}.json",
                    is_core=False,
                    updated_at=_now_iso(),
                )
                session.add(target_pack)
                target_commands: list[CommandTemplateRecord] = []
            else:
                target_commands = list(
                    session.exec(
                        select(CommandTemplateRecord)
                        .where(CommandTemplateRecord.pack_id == normalized_target_pack_id)
                        .order_by(TEMPLATE_POSITION_COLUMN)
                    ).all()
                )

            candidate_command_id = self._slugify(source_command.template_id, "cmd")
            used_target_ids = {item.template_id for item in target_commands}
            next_command_id = candidate_command_id
            suffix = 2
            while next_command_id in used_target_ids:
                next_command_id = f"{candidate_command_id}_{suffix}"
                suffix += 1

            moved_command = CommandTemplateRecord(
                pack_id=normalized_target_pack_id,
                template_id=next_command_id,
                name=source_command.name,
                command=source_command.command,
                description=source_command.description,
                position=len(target_commands) + 1,
            )
            session.add(moved_command)

            session.delete(source_command)
            remaining_source = [item for item in source_commands if item.template_id != source_command_id]
            for index, item in enumerate(remaining_source, start=1):
                item.position = index

            if not source_pack.is_core and not remaining_source:
                session.delete(source_pack)
            else:
                source_pack.updated_at = _now_iso()

            target_pack.updated_at = _now_iso()
            session.commit()

            return {
                "id": f"{normalized_target_pack_id}:{moved_command.template_id}",
                "name": moved_command.name,
                "command": moved_command.command,
                "description": moved_command.description,
                "pack_id": normalized_target_pack_id,
                "pack_file": target_pack.source_name,
                "moved_from_pack_id": source_pack_id,
            }

    def import_pack(self, payload: CommandPackImportPayload) -> CommandPackImportData:
        try:
            raw_json = json.loads(payload.content)
        except json.JSONDecodeError as error:
            raise ServiceError(status_code=400, detail=f"Invalid JSON: {error}") from error
        if not isinstance(raw_json, dict):
            raise ServiceError(status_code=400, detail="Import payload must contain a JSON object")

        parsed_pack = self._validate_pack(cast(JsonObject, raw_json), payload.file_name or "import.json")
        file_name = payload.file_name or f"{parsed_pack.pack_id}.json"
        safe_name = self._safe_file_name(file_name)

        with session_scope() as session:
            pack = session.get(CommandPackRecord, parsed_pack.pack_id)
            if pack is None:
                pack = CommandPackRecord(
                    pack_id=parsed_pack.pack_id,
                    pack_name=parsed_pack.pack_name,
                    description=parsed_pack.description,
                    source_name=safe_name,
                    is_core=parsed_pack.pack_id == "core",
                    updated_at=_now_iso(),
                )
                session.add(pack)
            else:
                pack.pack_name = parsed_pack.pack_name
                pack.description = parsed_pack.description
                pack.source_name = safe_name
                pack.updated_at = _now_iso()

                existing = session.exec(
                    select(CommandTemplateRecord)
                    .where(CommandTemplateRecord.pack_id == parsed_pack.pack_id)
                ).all()
                for item in existing:
                    session.delete(item)

            for index, item in enumerate(parsed_pack.commands, start=1):
                session.add(
                    CommandTemplateRecord(
                        pack_id=parsed_pack.pack_id,
                        template_id=item.id or f"cmd_{index}",
                        name=item.name,
                        command=item.command,
                        description=item.description,
                        position=index,
                    )
                )

            session.commit()

        return {
            "imported": True,
            "pack_id": parsed_pack.pack_id,
            "pack_name": parsed_pack.pack_name,
            "file_name": safe_name,
            "commands_count": len(parsed_pack.commands),
        }
