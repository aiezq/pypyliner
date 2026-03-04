from __future__ import annotations

from sqlalchemy.engine import Engine

from src.app.services.history_db import HistoryDatabase


def test_history_db_roundtrip_and_clear(isolated_db: Engine) -> None:
    _ = isolated_db
    history = HistoryDatabase()
    history.ensure_ready()
    history.clear_history()

    history.upsert_run(
        run_id="run_1",
        pipeline_name="Pipeline",
        status="running",
        started_at="2026-03-05T00:00:00Z",
        finished_at=None,
        log_file_path="/tmp/run.log",
    )
    history.upsert_run_session(
        session_id="session_1",
        run_id="run_1",
        step_id="step_1",
        position=1,
        title="Step #1",
        command="echo 1",
        status="success",
        exit_code=0,
    )
    history.upsert_manual_terminal(
        terminal_id="terminal_1",
        title="Terminal #1",
        created_at="2026-03-05T00:00:00Z",
        updated_at="2026-03-05T00:00:00Z",
        closed_at=None,
        log_file_path="/tmp/terminal.log",
    )
    history.append_manual_terminal_command(
        terminal_id="terminal_1",
        command="ls",
        created_at="2026-03-05T00:00:05Z",
    )

    data = history.fetch_history(runs_limit=10, terminal_limit=10)
    assert len(data["runs"]) == 1
    assert data["runs"][0]["id"] == "run_1"
    assert data["runs"][0]["sessions"][0]["id"] == "session_1"
    assert len(data["manual_terminal_history"]) == 1
    assert data["manual_terminal_history"][0]["commands"] == ["ls"]

    history.clear_history()
    empty = history.fetch_history(runs_limit=10, terminal_limit=10)
    assert empty["runs"] == []
    assert empty["manual_terminal_history"] == []
