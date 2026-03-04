from __future__ import annotations

from pathlib import Path
from typing import Callable, cast
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from src.app.schemas.terminal import ManualTerminalAutocompletePayload, ManualTerminalRenamePayload
from src.app.services.runtime import (
    MANUAL_TERMINAL_CWD,
    ManualTerminalState,
    PipelineRunState,
    PipelineSessionState,
    RuntimeManager,
    ServiceError,
    append_text_line,
    append_with_limit,
    make_id,
)
from src.app.core.constants import PROMPT_STATE_MARKER


def test_make_id_and_append_with_limit():
    run_id = make_id("run")
    assert run_id.startswith("run_")
    assert len(run_id) > 4

    items = [1, 2]
    append_with_limit(items, 3, max_size=2)
    assert items == [2, 3]


def test_append_text_line(tmp_path: Path):
    target = tmp_path / "nested" / "log.txt"
    append_text_line(target, "first")
    append_text_line(target, "second")
    assert target.read_text(encoding="utf-8") == "first\nsecond\n"


def test_prompt_parsing_helpers():
    runtime = RuntimeManager()
    parse_prompt_probe_line = cast(
        Callable[[str], tuple[str, str] | None],
        getattr(runtime, "_parse_prompt_probe_line"),
    )
    normalize_prompt_cwd = cast(
        Callable[[str], str],
        getattr(RuntimeManager, "_normalize_prompt_cwd"),
    )
    parsed = parse_prompt_probe_line(f"{PROMPT_STATE_MARKER}\tuser\t/Users/test")
    assert parsed is not None
    user, cwd = parsed
    assert user == "user"
    assert cwd.endswith("test")

    assert parse_prompt_probe_line("plain text") is None

    home = str(MANUAL_TERMINAL_CWD)
    assert normalize_prompt_cwd(home) == "~"
    assert normalize_prompt_cwd(f"{home}/src") == "~/src"
    assert normalize_prompt_cwd("/tmp") == "/tmp"


@pytest.mark.asyncio
async def test_complete_manual_terminal_command_variants(monkeypatch: pytest.MonkeyPatch):
    runtime = RuntimeManager()
    terminal = ManualTerminalState(
        id="terminal_1",
        title="Terminal #1",
        prompt_user="operator",
        prompt_cwd="~",
        status="idle",
        exit_code=None,
        created_at="2026-03-05T00:00:00Z",
        log_file_path=Path("/tmp/terminal_1.log"),
    )
    runtime.manual_terminals[terminal.id] = terminal

    monkeypatch.setattr(
        runtime,
        "_collect_completion_matches",
        AsyncMock(return_value=("ls ", "", ["src", "scripts"])),
    )
    result = await runtime.complete_manual_terminal_command(
        "terminal_1",
        ManualTerminalAutocompletePayload(command="ls s", base_command="ls s", cycle_index=1),
    )
    assert result["completed_command"] == "ls scripts"

    monkeypatch.setattr(
        runtime,
        "_collect_completion_matches",
        AsyncMock(return_value=("ls ", "", ["src", "script"])),
    )
    result = await runtime.complete_manual_terminal_command(
        "terminal_1",
        ManualTerminalAutocompletePayload(command="ls s", base_command="ls s"),
    )
    assert result["completed_command"] == "ls s"

    monkeypatch.setattr(
        runtime,
        "_collect_completion_matches",
        AsyncMock(return_value=("ls ", "", [])),
    )
    result = await runtime.complete_manual_terminal_command(
        "terminal_1",
        ManualTerminalAutocompletePayload(command="ls z"),
    )
    assert result["completed_command"] == "ls z"


@pytest.mark.asyncio
async def test_complete_manual_terminal_command_not_found():
    runtime = RuntimeManager()
    with pytest.raises(ServiceError):
        await runtime.complete_manual_terminal_command(
            "missing",
            ManualTerminalAutocompletePayload(command="ls"),
        )


@pytest.mark.asyncio
async def test_rename_and_stop_pipeline_run_branches():
    runtime = RuntimeManager()
    terminal = ManualTerminalState(
        id="terminal_1",
        title="Terminal #1",
        prompt_user="operator",
        prompt_cwd="~",
        status="idle",
        exit_code=None,
        created_at="2026-03-05T00:00:00Z",
        log_file_path=Path("/tmp/terminal_1.log"),
    )
    runtime.manual_terminals[terminal.id] = terminal

    with pytest.raises(ValidationError):
        ManualTerminalRenamePayload(title="")

    unchanged = await runtime.rename_manual_terminal(
        "terminal_1",
        ManualTerminalRenamePayload(title="Terminal #1"),
    )
    assert unchanged["title"] == "Terminal #1"

    session = PipelineSessionState(
        id="session_1",
        step_id="step_1",
        title="Step #1",
        command="echo 1",
        status="success",
        exit_code=0,
    )
    run = PipelineRunState(
        id="run_1",
        pipeline_name="Pipeline",
        status="success",
        started_at="2026-03-05T00:00:00Z",
        finished_at="2026-03-05T00:00:10Z",
        log_file_path=Path("/tmp/run_1.log"),
        sessions=[session],
    )
    runtime.runs[run.id] = run

    stopped = await runtime.stop_pipeline_run("run_1")
    assert stopped["status"] == "success"

    with pytest.raises(ServiceError):
        await runtime.stop_pipeline_run("missing")


def test_terminal_log_path_validation():
    path = RuntimeManager.get_terminal_log_path("terminal_123")
    assert path.name == "terminal_123.log"

    with pytest.raises(ServiceError):
        RuntimeManager.get_terminal_log_path("bad")
