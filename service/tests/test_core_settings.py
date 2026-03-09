from __future__ import annotations

from pathlib import Path

from src.app.core.settings import AppSettings, get_settings


def test_app_settings_finalize_defaults(tmp_path: Path):
    settings = AppSettings(service_dir=tmp_path, shell_executable="/bin/zsh")

    assert settings.logs_dir == tmp_path / "logs"
    assert settings.data_dir == tmp_path / "data"
    assert settings.runs_logs_dir == tmp_path / "logs" / "runs"
    assert settings.terminal_logs_dir == tmp_path / "logs" / "terminals"
    assert settings.db_path == tmp_path / "data" / "history.sqlite3"
    assert settings.database_url == f"sqlite:///{tmp_path / 'data' / 'history.sqlite3'}"
    assert settings.command_packs_dir == tmp_path / "command_packs"
    assert settings.pipeline_flows_dir == tmp_path / "pipeline_flows"
    assert settings.ai_data_dir == tmp_path / "data" / "ai"
    assert settings.ai_enabled is True
    assert settings.ai_runtime == "ollama"
    assert settings.ai_default_model == "gemma3"
    assert settings.ai_max_doc_chars == 120_000
    assert settings.ai_request_timeout_sec == 180
    assert settings.ai_install_timeout_sec == 3600
    assert settings.default_manual_terminal_command == "/bin/zsh --noprofile --norc"


def test_get_settings_is_cached():
    first = get_settings()
    second = get_settings()
    assert first is second
