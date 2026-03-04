from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy.engine import Engine
from sqlalchemy import delete

from src.app.core.database import session_scope
from src.app.models.db import CommandPackRecord, CommandTemplateRecord
from src.app.schemas.command_pack import (
    CommandPackImportPayload,
    CommandTemplateCreatePayload,
    CommandTemplateUpdatePayload,
)
from src.app.services.command_packs import CommandPackManager


def _clear_command_tables() -> None:
    with session_scope() as session:
        session.exec(delete(CommandTemplateRecord))
        session.exec(delete(CommandPackRecord))
        session.commit()


@pytest.mark.asyncio
async def test_command_packs_full_crud_flow(tmp_path: Path, isolated_db: Engine) -> None:
    _ = isolated_db
    _clear_command_tables()

    manager = CommandPackManager()
    legacy_packs_dir = tmp_path / "command_packs"
    setattr(manager, "_legacy_packs_dir", legacy_packs_dir)
    legacy_packs_dir.mkdir(parents=True, exist_ok=True)

    await manager.ensure_ready()

    listed = manager.list_command_packs()
    assert any(pack["pack_id"] == "core" for pack in listed["packs"])

    created = manager.create_template(
        CommandTemplateCreatePayload(
            name="Custom Cmd",
            command="echo custom",
            description="custom",
            pack_id="custom",
        )
    )
    assert created["pack_id"] == "custom"

    updated = manager.update_template(
        created["id"],
        CommandTemplateUpdatePayload(name="Custom Updated", command="echo updated"),
    )
    assert updated["name"] == "Custom Updated"

    moved = manager.move_template(created["id"], "core")
    assert moved["pack_id"] == "core"
    assert moved.get("moved_from_pack_id") == "custom"

    imported = manager.import_pack(
        CommandPackImportPayload(
            file_name="imported.json",
            content=json.dumps(
                {
                    "pack_id": "custom",
                    "pack_name": "Custom",
                    "description": "Imported",
                    "commands": [
                        {
                            "id": "imp_1",
                            "name": "Imported",
                            "command": "echo imported",
                            "description": "",
                        }
                    ],
                }
            ),
        )
    )
    assert imported["imported"] is True
    assert imported["pack_id"] == "custom"

    deleted = manager.delete_template("custom:imp_1")
    assert deleted["deleted"] is True
