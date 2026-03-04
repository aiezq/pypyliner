from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from src.app.core import database as db


def test_init_db_imports_models_and_creates_metadata(monkeypatch: pytest.MonkeyPatch):
    import_module = MagicMock()
    create_all = MagicMock()

    monkeypatch.setattr(db.importlib, "import_module", import_module)
    monkeypatch.setattr(db.SQLModel.metadata, "create_all", create_all)

    db.init_db()

    import_module.assert_called_once_with("src.app.models")
    create_all.assert_called_once_with(db.engine)


def test_run_migrations_falls_back_to_init_db_when_ini_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    init_db = MagicMock()
    monkeypatch.setattr(db, "init_db", init_db)
    monkeypatch.setattr(db.settings, "service_dir", str(tmp_path))

    db.run_migrations()

    init_db.assert_called_once()


def test_run_migrations_executes_upgrade_when_ini_present(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    (tmp_path / "alembic.ini").write_text("[alembic]\n", encoding="utf-8")
    monkeypatch.setattr(db.settings, "service_dir", str(tmp_path))
    monkeypatch.setattr(db.settings, "database_url", "sqlite:///tmp/test.sqlite3")

    upgrade = MagicMock()
    monkeypatch.setattr("alembic.command.upgrade", upgrade)

    class FakeConfig:
        def __init__(self, path: str) -> None:
            self.path = path
            self.options: dict[str, str] = {}

        def set_main_option(self, key: str, value: str) -> None:
            self.options[key] = value

    monkeypatch.setattr("alembic.config.Config", FakeConfig)

    db.run_migrations()

    upgrade.assert_called_once()
    config_arg, revision_arg = upgrade.call_args.args
    assert isinstance(config_arg, FakeConfig)
    assert config_arg.path == str(tmp_path / "alembic.ini")
    assert config_arg.options["sqlalchemy.url"] == "sqlite:///tmp/test.sqlite3"
    assert revision_arg == "head"
