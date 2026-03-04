from __future__ import annotations

from typing import Any, Callable, cast

import pytest

from src.app.services.command_packs import CommandPackManager
from src.app.services.runtime import ServiceError


def test_command_pack_slugify_and_safe_file_name() -> None:
    slugify = cast(Callable[[str, str], str], getattr(CommandPackManager, "_slugify"))
    safe_file_name = cast(Callable[[str], str], getattr(CommandPackManager, "_safe_file_name"))

    assert slugify(" My Pack! ", "fallback") == "my_pack"
    assert slugify("___", "fallback") == "fallback"
    assert safe_file_name("../../etc/passwd") == "passwd.json"
    assert safe_file_name("custom.pack.json") == "custom.pack.json"


def test_command_pack_normalize_pack_dict() -> None:
    normalize_pack = cast(
        Callable[[dict[str, Any], str], dict[str, Any]],
        getattr(CommandPackManager, "_normalize_pack_dict"),
    )
    normalized = normalize_pack(
        {"pack_name": "My Pack", "templates": [{"name": "A", "command": "echo 1", "description": ""}]},
        "legacy_pack.json",
    )
    assert normalized["pack_id"] == "legacy_pack"
    commands = cast(list[dict[str, Any]], normalized["commands"])
    assert commands[0]["name"] == "A"


def test_validate_pack_generates_unique_template_ids() -> None:
    manager = CommandPackManager()
    validate_pack = cast(Callable[[dict[str, Any], str], Any], getattr(manager, "_validate_pack"))
    parsed = validate_pack(
        {
            "pack_id": "My Pack",
            "pack_name": "My Pack",
            "description": "desc",
            "commands": [
                {"id": "dup", "name": "Cmd 1", "command": "echo 1", "description": ""},
                {"id": "dup", "name": "Cmd 2", "command": "echo 2", "description": ""},
                {"id": None, "name": "Cmd 2", "command": "echo 3", "description": ""},
            ],
        },
        "my-pack.json",
    )

    ids = [item.id for item in parsed.commands]
    assert ids[0] == "dup"
    assert ids[1] == "dup_2"
    assert ids[2] == "cmd_2"


def test_validate_pack_rejects_invalid_payload():
    manager = CommandPackManager()
    validate_pack = cast(Callable[[dict[str, Any], str], Any], getattr(manager, "_validate_pack"))
    with pytest.raises(ServiceError):
        validate_pack({"commands": []}, "broken.json")
