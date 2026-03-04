from __future__ import annotations

import sys
from pathlib import Path

import pytest
from sqlmodel import create_engine

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


@pytest.fixture
def isolated_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from src.app.core import database as database_module

    db_path = tmp_path / "test.sqlite3"
    db_url = f"sqlite:///{db_path}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False})

    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module.settings, "database_url", db_url)
    database_module.init_db()
    yield engine
    engine.dispose()
