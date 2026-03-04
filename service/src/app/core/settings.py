from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_SERVICE_DIR = Path(__file__).resolve().parents[3]
_DEFAULT_LOGS_DIR = _DEFAULT_SERVICE_DIR / "logs"
_DEFAULT_DATA_DIR = _DEFAULT_SERVICE_DIR / "data"
_DEFAULT_DB_PATH = _DEFAULT_DATA_DIR / "history.sqlite3"


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="OPERATOR_",
        extra="ignore",
    )

    service_dir: Path = _DEFAULT_SERVICE_DIR
    logs_dir: Path = _DEFAULT_LOGS_DIR
    data_dir: Path = _DEFAULT_DATA_DIR
    runs_logs_dir: Path = _DEFAULT_LOGS_DIR / "runs"
    terminal_logs_dir: Path = _DEFAULT_LOGS_DIR / "terminals"

    db_path: Path = _DEFAULT_DB_PATH
    database_url: str = f"sqlite:///{_DEFAULT_DB_PATH}"

    command_packs_dir: Path = _DEFAULT_SERVICE_DIR / "command_packs"
    pipeline_flows_dir: Path = _DEFAULT_SERVICE_DIR / "pipeline_flows"

    max_lines_in_memory: int = 600
    shell_executable: str = "/bin/bash"
    default_manual_terminal_command: str = "/bin/bash --noprofile --norc"
    default_manual_terminal_cwd: Path = Field(default_factory=Path.home)
    prompt_state_marker: str = "__OPERATOR_HELPER_PROMPT__"
    pipeline_open_terminal_command: str = "operator:create_terminal"

    @model_validator(mode="after")
    def finalize(self) -> "AppSettings":
        fields_set = self.model_fields_set

        if "logs_dir" not in fields_set:
            self.logs_dir = self.service_dir / "logs"
        if "data_dir" not in fields_set:
            self.data_dir = self.service_dir / "data"

        if "runs_logs_dir" not in fields_set:
            self.runs_logs_dir = self.logs_dir / "runs"
        if "terminal_logs_dir" not in fields_set:
            self.terminal_logs_dir = self.logs_dir / "terminals"

        if "db_path" not in fields_set:
            self.db_path = self.data_dir / "history.sqlite3"
        if "database_url" not in fields_set:
            self.database_url = f"sqlite:///{self.db_path}"

        if "command_packs_dir" not in fields_set:
            self.command_packs_dir = self.service_dir / "command_packs"
        if "pipeline_flows_dir" not in fields_set:
            self.pipeline_flows_dir = self.service_dir / "pipeline_flows"

        if "default_manual_terminal_command" not in fields_set:
            self.default_manual_terminal_command = f"{self.shell_executable} --noprofile --norc"

        return self


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings()
