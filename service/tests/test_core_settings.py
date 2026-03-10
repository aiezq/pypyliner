from __future__ import annotations

from pathlib import Path

from src.app.core.settings import AppSettings, get_settings


def test_app_settings_finalize_defaults(tmp_path: Path):
    settings = AppSettings(service_dir=tmp_path, shell_executable="/bin/zsh")

    assert settings.logs_dir == tmp_path / "logs"
    assert settings.data_dir == tmp_path / "data"
    assert settings.runs_logs_dir == tmp_path / "logs" / "runs"
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
    assert settings.shell_executable == "/bin/zsh"


def test_get_settings_is_cached():
    first = get_settings()
    second = get_settings()
    assert first is second


def test_app_settings_defaults_to_service_dir_when_writable(monkeypatch, tmp_path: Path):
    monkeypatch.setattr("src.app.core.settings._DEFAULT_SERVICE_DIR", tmp_path)
    monkeypatch.setattr("src.app.core.settings._is_writable_directory", lambda path: True)

    settings = AppSettings()

    assert settings.logs_dir == tmp_path / "logs"
    assert settings.data_dir == tmp_path / "data"
    assert settings.db_path == tmp_path / "data" / "history.sqlite3"
    assert settings.command_packs_dir == tmp_path / "command_packs"
    assert settings.pipeline_flows_dir == tmp_path / "pipeline_flows"
    assert settings.ai_data_dir == tmp_path / "data" / "ai"


def test_app_settings_defaults_to_user_writable_support_dir(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setattr("platform.system", lambda: "Darwin")
    monkeypatch.setattr("src.app.core.settings._is_writable_directory", lambda path: False)

    settings = AppSettings()

    support_root = tmp_path / "Library" / "Application Support" / "Operator Helper"
    assert settings.logs_dir == support_root / "logs"
    assert settings.data_dir == support_root / "data"
    assert settings.runs_logs_dir == support_root / "logs" / "runs"
    assert settings.db_path == support_root / "data" / "history.sqlite3"
    assert settings.database_url == f"sqlite:///{support_root / 'data' / 'history.sqlite3'}"
    assert settings.command_packs_dir == support_root / "command_packs"
    assert settings.pipeline_flows_dir == support_root / "pipeline_flows"
    assert settings.ai_data_dir == support_root / "data" / "ai"
