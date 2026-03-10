from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from src.app.core import database as db


def test_init_db_imports_models_and_creates_metadata(monkeypatch: pytest.MonkeyPatch):
    import_module = MagicMock()
    create_all = MagicMock()
    ensure_sqlite_parent_dir = MagicMock()

    monkeypatch.setattr(db.importlib, "import_module", import_module)
    monkeypatch.setattr(db.SQLModel.metadata, "create_all", create_all)
    monkeypatch.setattr(db, "_ensure_sqlite_parent_dir", ensure_sqlite_parent_dir)

    db.init_db()

    import_module.assert_called_once_with("src.app.models")
    ensure_sqlite_parent_dir.assert_called_once_with()
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
    ensure_sqlite_parent_dir = MagicMock()
    monkeypatch.setattr(db, "_ensure_sqlite_parent_dir", ensure_sqlite_parent_dir)

    db.run_migrations()

    ensure_sqlite_parent_dir.assert_called_once_with()
    upgrade.assert_called_once()
    config_arg, revision_arg = upgrade.call_args.args
    assert isinstance(config_arg, FakeConfig)
    assert config_arg.path == str(tmp_path / "alembic.ini")
    assert config_arg.options["sqlalchemy.url"] == "sqlite:///tmp/test.sqlite3"
    assert revision_arg == "head"


def test_ensure_sqlite_parent_dir_creates_database_parent(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    database_path = tmp_path / "nested" / "history.sqlite3"
    monkeypatch.setattr(db.settings, "database_url", f"sqlite:///{database_path}")

    db._ensure_sqlite_parent_dir()

    assert database_path.parent.exists()
