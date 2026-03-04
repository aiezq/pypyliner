from __future__ import annotations

from pathlib import Path
from typing import cast

import pytest

from src.app.api.routes.command_packs import (
    create_command_template,
    delete_command_template,
    import_command_pack,
    list_command_packs,
    move_command_template,
    update_command_template,
)
from src.app.api.routes.health import health
from src.app.api.routes.history import get_history
from src.app.api.routes.pipeline_flows import (
    create_pipeline_flow,
    delete_pipeline_flow,
    list_pipeline_flows,
    update_pipeline_flow,
)
from src.app.api.routes.runs import create_run, get_run, get_run_log, get_runs, stop_run
from src.app.api.routes.state import get_state
from src.app.api.routes.terminals import (
    clear_terminal,
    close_terminal,
    complete_terminal_command,
    create_terminal,
    get_terminal_log,
    get_terminals,
    rename_terminal,
    run_terminal_command,
    stop_terminal,
)
from src.app.schemas.command_pack import (
    CommandPackImportPayload,
    CommandTemplateCreatePayload,
    CommandTemplateMovePayload,
    CommandTemplateUpdatePayload,
)
from src.app.schemas.pipeline import PipelineRunCreatePayload, PipelineStepPayload
from src.app.schemas.pipeline_flow import PipelineFlowCreatePayload, PipelineFlowStepPayload
from src.app.schemas.service_types import (
    CommandPackImportData,
    CommandPackListData,
    CommandTemplateData,
    CommandTemplateDeleteData,
    CommandTemplateMutationData,
    CompletionData,
    HistoryData,
    ManualTerminalData,
    PipelineFlowData,
    PipelineFlowDeleteData,
    PipelineFlowListData,
    PipelineRunData,
    StateSnapshotData,
    TerminalLineData,
)
from src.app.schemas.terminal import (
    ManualTerminalAutocompletePayload,
    ManualTerminalCommandPayload,
    ManualTerminalCreatePayload,
    ManualTerminalRenamePayload,
)
from src.app.services.command_packs import CommandPackManager
from src.app.services.pipeline_flows import PipelineFlowManager
from src.app.services.runtime import RuntimeManager


def _line() -> TerminalLineData:
    return {
        "id": "line_1",
        "stream": "out",
        "text": "hello",
        "created_at": "2026-03-05T00:00:00Z",
    }


def _run() -> PipelineRunData:
    return {
        "id": "run_1",
        "pipeline_name": "Pipeline",
        "status": "running",
        "started_at": "2026-03-05T00:00:00Z",
        "finished_at": None,
        "log_file_path": "/tmp/run_1.log",
        "sessions": [
            {
                "id": "session_1",
                "step_id": "step_1",
                "title": "Step #1",
                "command": "echo 1",
                "status": "running",
                "exit_code": None,
                "lines": [_line()],
            }
        ],
    }


def _terminal() -> ManualTerminalData:
    return {
        "id": "terminal_1",
        "title": "Terminal #1",
        "prompt_user": "operator",
        "prompt_cwd": "~",
        "status": "running",
        "exit_code": None,
        "created_at": "2026-03-05T00:00:00Z",
        "draft_command": "",
        "log_file_path": "/tmp/terminal_1.log",
        "lines": [_line()],
    }


def _flow() -> PipelineFlowData:
    return {
        "id": "flow_1",
        "flow_name": "Flow #1",
        "created_at": "2026-03-05T00:00:00Z",
        "updated_at": "2026-03-05T00:00:00Z",
        "file_name": "flow_1.json",
        "steps": [{"type": "custom", "label": "Run", "command": "echo 1"}],
    }


def _template() -> CommandTemplateData:
    return {
        "id": "custom:cmd_1",
        "name": "Cmd",
        "command": "echo 1",
        "description": "test",
    }


class RuntimeStub:
    def list_runs(self) -> list[PipelineRunData]:
        return [_run()]

    def get_run(self, run_id: str) -> PipelineRunData:
        assert run_id == "run_1"
        return _run()

    async def create_pipeline_run(self, payload: PipelineRunCreatePayload) -> PipelineRunData:
        assert payload.pipeline_name == "Pipeline"
        return _run()

    async def stop_pipeline_run(self, run_id: str) -> PipelineRunData:
        assert run_id == "run_1"
        data = _run()
        data["status"] = "stopped"
        return data

    def get_run_log_path(self, run_id: str) -> Path:
        assert run_id == "run_1"
        return Path("/tmp/run.log")

    def list_manual_terminals(self) -> list[ManualTerminalData]:
        return [_terminal()]

    async def create_manual_terminal(self, payload: ManualTerminalCreatePayload) -> ManualTerminalData:
        assert payload.title == "Terminal #1"
        return _terminal()

    async def run_manual_terminal_command(
        self,
        terminal_id: str,
        payload: ManualTerminalCommandPayload,
    ) -> ManualTerminalData:
        assert terminal_id == "terminal_1"
        assert payload.command == "ls"
        return _terminal()

    async def complete_manual_terminal_command(
        self,
        terminal_id: str,
        payload: ManualTerminalAutocompletePayload,
    ) -> CompletionData:
        assert terminal_id == "terminal_1"
        return {
            "terminal_id": terminal_id,
            "command": payload.command,
            "base_command": payload.base_command or payload.command,
            "completed_command": "ls src",
            "matches": ["src", "src/app"],
        }

    async def rename_manual_terminal(
        self,
        terminal_id: str,
        payload: ManualTerminalRenamePayload,
    ) -> ManualTerminalData:
        assert terminal_id == "terminal_1"
        assert payload.title == "Renamed"
        data = _terminal()
        data["title"] = payload.title
        return data

    async def stop_manual_terminal(self, terminal_id: str) -> ManualTerminalData:
        assert terminal_id == "terminal_1"
        data = _terminal()
        data["status"] = "stopped"
        return data

    async def clear_manual_terminal(self, terminal_id: str) -> ManualTerminalData:
        assert terminal_id == "terminal_1"
        data = _terminal()
        data["lines"] = []
        return data

    async def close_manual_terminal(self, terminal_id: str) -> None:
        assert terminal_id == "terminal_1"
        return None

    def get_terminal_log_path(self, terminal_id: str) -> Path:
        assert terminal_id == "terminal_1"
        return Path("/tmp/terminal.log")

    def history(self) -> HistoryData:
        return {"runs": [_run()], "manual_terminal_history": []}

    def snapshot(self) -> StateSnapshotData:
        return {"runs": [_run()], "manual_terminals": [_terminal()]}


class FlowManagerStub:
    def list_flows(self) -> PipelineFlowListData:
        return {"flows": [_flow()], "errors": []}

    def create_flow(self, payload: PipelineFlowCreatePayload) -> PipelineFlowData:
        assert payload.flow_name == "Flow #1"
        return _flow()

    def update_flow(self, flow_id: str, payload: PipelineFlowCreatePayload) -> PipelineFlowData:
        assert flow_id == "flow_1"
        assert payload.flow_name == "Flow #1"
        data = _flow()
        data["id"] = flow_id
        return data

    def delete_flow(self, flow_id: str) -> PipelineFlowDeleteData:
        assert flow_id == "flow_1"
        return {"deleted": True, "flow_id": flow_id}


class CommandPackManagerStub:
    def list_command_packs(self) -> CommandPackListData:
        template = _template()
        return {
            "packs": [
                {
                    "pack_id": "custom",
                    "pack_name": "Custom",
                    "description": "desc",
                    "file_name": "custom.json",
                    "templates": [template],
                }
            ],
            "templates": [template],
            "errors": [],
        }

    def create_template(self, payload: CommandTemplateCreatePayload) -> CommandTemplateMutationData:
        assert payload.name == "Cmd"
        template = _template()
        return {
            "id": template["id"],
            "name": template["name"],
            "command": template["command"],
            "description": template["description"],
            "pack_id": "custom",
            "pack_file": "custom.json",
        }

    def update_template(
        self,
        template_id: str,
        payload: CommandTemplateUpdatePayload,
    ) -> CommandTemplateMutationData:
        assert template_id == "custom:cmd_1"
        assert payload.name == "Cmd"
        template = _template()
        return {
            "id": template["id"],
            "name": template["name"],
            "command": template["command"],
            "description": template["description"],
            "pack_id": "custom",
            "pack_file": "custom.json",
        }

    def delete_template(self, template_id: str) -> CommandTemplateDeleteData:
        assert template_id == "custom:cmd_1"
        return {
            "deleted": True,
            "template_id": template_id,
            "pack_id": "custom",
            "pack_file": "custom.json",
        }

    def move_template(self, template_id: str, target_pack_id: str) -> CommandTemplateMutationData:
        assert template_id == "custom:cmd_1"
        assert target_pack_id == "core"
        template = _template()
        return {
            "id": template["id"],
            "name": template["name"],
            "command": template["command"],
            "description": template["description"],
            "pack_id": "core",
            "pack_file": "default.json",
            "moved_from_pack_id": "custom",
        }

    def import_pack(self, payload: CommandPackImportPayload) -> CommandPackImportData:
        assert payload.file_name == "pack.json"
        return {
            "imported": True,
            "pack_id": "custom",
            "pack_name": "Custom",
            "file_name": "pack.json",
            "commands_count": 1,
        }


@pytest.mark.asyncio
async def test_health_state_history_routes():
    runtime = RuntimeStub()
    health_res = await health()
    state_res = await get_state(runtime=cast(RuntimeManager, runtime))
    history_res = await get_history(runtime=cast(RuntimeManager, runtime))

    assert health_res.status == "ok"
    assert state_res.runs[0].id == "run_1"
    assert history_res.runs[0].pipeline_name == "Pipeline"


@pytest.mark.asyncio
async def test_runs_routes(tmp_path: Path):
    runtime = RuntimeStub()
    run_log = tmp_path / "run.log"
    run_log.write_text("run-log", encoding="utf-8")
    runtime.get_run_log_path = lambda _run_id: run_log  # type: ignore[method-assign]

    runs_res = await get_runs(runtime=cast(RuntimeManager, runtime))
    run_res = await get_run("run_1", runtime=cast(RuntimeManager, runtime))
    create_res = await create_run(
        payload=PipelineRunCreatePayload(
            pipeline_name="Pipeline",
            steps=[PipelineStepPayload(label="Step #1", command="echo 1")],
        ),
        runtime=cast(RuntimeManager, runtime),
    )
    stop_res = await stop_run("run_1", runtime=cast(RuntimeManager, runtime))
    log_text = await get_run_log("run_1", runtime=cast(RuntimeManager, runtime))

    assert runs_res.runs[0].id == "run_1"
    assert run_res.pipeline_name == "Pipeline"
    assert create_res.id == "run_1"
    assert stop_res.status == "stopped"
    assert log_text == "run-log"


@pytest.mark.asyncio
async def test_terminals_routes(tmp_path: Path):
    runtime = RuntimeStub()
    terminal_log = tmp_path / "terminal.log"
    terminal_log.write_text("terminal-log", encoding="utf-8")
    runtime.get_terminal_log_path = lambda _terminal_id: terminal_log  # type: ignore[method-assign]

    terminals_res = await get_terminals(runtime=cast(RuntimeManager, runtime))
    created_res = await create_terminal(
        payload=ManualTerminalCreatePayload(title="Terminal #1"),
        runtime=cast(RuntimeManager, runtime),
    )
    run_res = await run_terminal_command(
        terminal_id="terminal_1",
        payload=ManualTerminalCommandPayload(command="ls"),
        runtime=cast(RuntimeManager, runtime),
    )
    complete_res = await complete_terminal_command(
        terminal_id="terminal_1",
        payload=ManualTerminalAutocompletePayload(command="ls s", base_command="ls s", cycle_index=0),
        runtime=cast(RuntimeManager, runtime),
    )
    rename_res = await rename_terminal(
        terminal_id="terminal_1",
        payload=ManualTerminalRenamePayload(title="Renamed"),
        runtime=cast(RuntimeManager, runtime),
    )
    stop_res = await stop_terminal("terminal_1", runtime=cast(RuntimeManager, runtime))
    clear_res = await clear_terminal("terminal_1", runtime=cast(RuntimeManager, runtime))
    close_res = await close_terminal("terminal_1", runtime=cast(RuntimeManager, runtime))
    log_text = await get_terminal_log("terminal_1", runtime=cast(RuntimeManager, runtime))

    assert terminals_res.manual_terminals[0].id == "terminal_1"
    assert created_res.id == "terminal_1"
    assert run_res.status == "running"
    assert complete_res.completed_command == "ls src"
    assert rename_res.title == "Renamed"
    assert stop_res.status == "stopped"
    assert clear_res.lines == []
    assert close_res.deleted is True
    assert log_text == "terminal-log"


@pytest.mark.asyncio
async def test_pipeline_flows_routes():
    manager = FlowManagerStub()
    payload = PipelineFlowCreatePayload(
        flow_name="Flow #1",
        steps=[PipelineFlowStepPayload(type="custom", label="Run", command="echo 1")],
    )

    list_res = await list_pipeline_flows(manager=cast(PipelineFlowManager, manager))
    create_res = await create_pipeline_flow(payload=payload, manager=cast(PipelineFlowManager, manager))
    update_res = await update_pipeline_flow(
        flow_id="flow_1",
        payload=payload,
        manager=cast(PipelineFlowManager, manager),
    )
    delete_res = await delete_pipeline_flow(
        flow_id="flow_1",
        manager=cast(PipelineFlowManager, manager),
    )

    assert list_res.flows[0].id == "flow_1"
    assert create_res.flow_name == "Flow #1"
    assert update_res.id == "flow_1"
    assert delete_res.deleted is True


@pytest.mark.asyncio
async def test_command_packs_routes():
    manager = CommandPackManagerStub()

    list_res = await list_command_packs(manager=cast(CommandPackManager, manager))
    create_res = await create_command_template(
        payload=CommandTemplateCreatePayload(name="Cmd", command="echo 1", description="desc", pack_id="custom"),
        manager=cast(CommandPackManager, manager),
    )
    update_res = await update_command_template(
        template_id="custom:cmd_1",
        payload=CommandTemplateUpdatePayload(name="Cmd", command="echo 1"),
        manager=cast(CommandPackManager, manager),
    )
    delete_res = await delete_command_template(
        template_id="custom:cmd_1",
        manager=cast(CommandPackManager, manager),
    )
    move_res = await move_command_template(
        template_id="custom:cmd_1",
        payload=CommandTemplateMovePayload(target_pack_id="core"),
        manager=cast(CommandPackManager, manager),
    )
    import_res = await import_command_pack(
        payload=CommandPackImportPayload(file_name="pack.json", content='{"pack_id":"custom","pack_name":"x","commands":[{"name":"n","command":"echo 1","description":""}]}'),
        manager=cast(CommandPackManager, manager),
    )

    assert list_res.packs[0].pack_id == "custom"
    assert create_res.id == "custom:cmd_1"
    assert update_res.pack_file == "custom.json"
    assert delete_res.deleted is True
    assert move_res.moved_from_pack_id == "custom"
    assert import_res.imported is True
