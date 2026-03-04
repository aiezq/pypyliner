from __future__ import annotations

from contextlib import contextmanager
import importlib
from pathlib import Path
from typing import Iterator

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


def init_db() -> None:
    # Load models so SQLModel metadata is populated before create_all.
    importlib.import_module("src.app.models")

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
    command.upgrade(config, "head")
