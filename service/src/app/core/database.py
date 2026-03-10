from __future__ import annotations

from contextlib import contextmanager
import importlib
from pathlib import Path
from typing import Iterator

from sqlalchemy.engine import make_url
from sqlmodel import Session, SQLModel, create_engine

from src.app.core.settings import get_settings

settings = get_settings()

connect_args: dict[str, object] = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.database_url, connect_args=connect_args)


@contextmanager
def session_scope() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def _ensure_sqlite_parent_dir() -> None:
    try:
        url = make_url(settings.database_url)
    except Exception:
        return

    if not url.drivername.startswith("sqlite"):
        return

    database = url.database
    if not database or database == ":memory:":
        return

    Path(database).expanduser().parent.mkdir(parents=True, exist_ok=True)


def init_db() -> None:
    # Load models so SQLModel metadata is populated before create_all.
    importlib.import_module("src.app.models")
    _ensure_sqlite_parent_dir()

    SQLModel.metadata.create_all(engine)


def run_migrations() -> None:
    """Run Alembic migrations when configuration is available."""
    ini_path = Path(settings.service_dir) / "alembic.ini"
    if not ini_path.exists():
        init_db()
        return

    try:
        from alembic import command
        from alembic.config import Config
    except Exception:
        init_db()
        return

    config = Config(str(ini_path))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    _ensure_sqlite_parent_dir()
    command.upgrade(config, "head")
