from __future__ import annotations

import os
import platform
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_SERVICE_DIR = Path(__file__).resolve().parents[3]
_APP_DIR_NAME = "Operator Helper"


def _is_writable_directory(path: Path) -> bool:
    return os.access(path, os.W_OK)


def _default_support_root() -> Path:
    system = platform.system().lower()
    home = Path.home()

    if system == "darwin":
        return home / "Library" / "Application Support" / _APP_DIR_NAME

    xdg_data_home = os.environ.get("XDG_DATA_HOME")
    if xdg_data_home:
        return Path(xdg_data_home) / "operator-helper"

    return home / ".local" / "share" / "operator-helper"


def _default_runtime_root() -> Path:
    if _is_writable_directory(_DEFAULT_SERVICE_DIR):
        return _DEFAULT_SERVICE_DIR
    return _default_support_root()


def _default_logs_dir() -> Path:
    return _default_runtime_root() / "logs"


def _default_data_dir() -> Path:
    return _default_runtime_root() / "data"


def _default_db_path() -> Path:
    return _default_data_dir() / "history.sqlite3"


def _default_command_packs_dir() -> Path:
    return _default_runtime_root() / "command_packs"


def _default_pipeline_flows_dir() -> Path:
    return _default_runtime_root() / "pipeline_flows"


def _default_ai_data_dir() -> Path:
    return _default_data_dir() / "ai"


def _default_shell_executable() -> str:
    shell = os.environ.get("SHELL", "").strip()
    if shell:
        return shell
    if Path("/bin/zsh").exists():
        return "/bin/zsh"
    return "/bin/bash"


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="OPERATOR_",
        extra="ignore",
    )

    service_dir: Path = _DEFAULT_SERVICE_DIR
    logs_dir: Path = Field(default_factory=_default_logs_dir)
    data_dir: Path = Field(default_factory=_default_data_dir)
    runs_logs_dir: Path = Field(default_factory=lambda: _default_logs_dir() / "runs")

    db_path: Path = Field(default_factory=_default_db_path)
    database_url: str = Field(default_factory=lambda: f"sqlite:///{_default_db_path()}")

    command_packs_dir: Path = Field(default_factory=_default_command_packs_dir)
    pipeline_flows_dir: Path = Field(default_factory=_default_pipeline_flows_dir)
    ai_enabled: bool = True
    ai_data_dir: Path = Field(default_factory=_default_ai_data_dir)
    ai_runtime: Literal["ollama"] = "ollama"
    ai_default_model: str = "gemma3"
    ai_max_doc_chars: int = 120_000
    ai_request_timeout_sec: int = 180
    ai_install_timeout_sec: int = 3600

    max_lines_in_memory: int = 600
    shell_executable: str = Field(default_factory=_default_shell_executable)

    @model_validator(mode="after")
    def finalize(self) -> "AppSettings":
        fields_set = self.model_fields_set
        service_dir_overridden = "service_dir" in fields_set

        if service_dir_overridden and "logs_dir" not in fields_set:
            self.logs_dir = self.service_dir / "logs"
        if service_dir_overridden and "data_dir" not in fields_set:
            self.data_dir = self.service_dir / "data"

        if "runs_logs_dir" not in fields_set:
            self.runs_logs_dir = self.logs_dir / "runs"

        if service_dir_overridden and "db_path" not in fields_set:
            self.db_path = self.data_dir / "history.sqlite3"
        if "database_url" not in fields_set:
            self.database_url = f"sqlite:///{self.db_path}"

        if service_dir_overridden and "command_packs_dir" not in fields_set:
            self.command_packs_dir = self.service_dir / "command_packs"
        if service_dir_overridden and "pipeline_flows_dir" not in fields_set:
            self.pipeline_flows_dir = self.service_dir / "pipeline_flows"
        if service_dir_overridden and "ai_data_dir" not in fields_set:
            self.ai_data_dir = self.data_dir / "ai"

        return self


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings()
