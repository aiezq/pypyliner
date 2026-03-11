from __future__ import annotations

from pathlib import Path
from typing import cast

import pytest
from starlette.responses import Response

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
from src.app.api.routes.terminals import (
    append_terminal_command,
    clear_terminal,
    create_terminal,
    delete_terminal,
    execute_terminal,
    get_terminal,
    get_terminals,
    stop_terminal,
)
from src.app.api.routes.state import get_state
from src.app.api.routes.sequences import execute_sequence, get_sequence, get_sequences
from src.app.schemas.command_pack import (
    CommandPackImportPayload,
    CommandTemplateCreatePayload,
    CommandTemplateMovePayload,
    CommandTemplateUpdatePayload,
)
from src.app.schemas.pipeline import PipelineRunCreatePayload, PipelineStepPayload
from src.app.schemas.pipeline_flow import PipelineFlowCreatePayload, PipelineFlowStepPayload
from src.app.schemas.terminal import (
    SequenceExecutionPayload,
    TerminalAppendCommandPayload,
    TerminalCommandPayload,
    TerminalCreatePayload,
    TerminalExecutionPayload,
)
from src.app.schemas.service_types import (
    CommandPackImportData,
    CommandPackListData,
    CommandTemplateData,
    CommandTemplateDeleteData,
    CommandTemplateMutationData,
    HistoryData,
    PipelineFlowData,
    PipelineFlowDeleteData,
    PipelineFlowListData,
    PipelineRunData,
    SequenceExecutionData,
    StateSnapshotData,
    TerminalLineData,
    TerminalSessionData,
)
from src.app.services.command_packs import CommandPackManager
from src.app.services.pipeline_flows import PipelineFlowManager
from src.app.services.runtime import RuntimeManager


async def _read_response_text(response: Response) -> str:
  body = getattr(response, "body", None)
  if body is not None:
    return body.decode("utf-8")

  chunks: list[bytes] = []
  async for chunk in response.body_iterator:
    chunks.append(chunk if isinstance(chunk, bytes) else chunk.encode("utf-8"))
  return b"".join(chunks).decode("utf-8")


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


def _terminal() -> TerminalSessionData:
  return {
    "id": "term_1",
    "terminal_node_id": "node_terminal_1",
    "sequence_id": None,
    "title": "Terminal",
    "terminal_type": "local",
    "ssh_connection_name": None,
    "ssh_host": None,
    "ssh_username": None,
    "status": "running",
    "created_at": "2026-03-05T00:00:00Z",
    "started_at": "2026-03-05T00:00:01Z",
    "finished_at": None,
    "exit_code": None,
    "current_command_index": 0,
    "current_command_id": "cmd_1",
    "shell_pid": 123,
    "queue": [
      {
        "id": "cmd_1",
        "node_id": "node_cmd_1",
        "label": "Run",
        "original_command": "echo 1",
        "resolved_command": "echo 1",
        "status": "running",
        "started_at": "2026-03-05T00:00:01Z",
        "finished_at": None,
        "exit_code": None,
      }
    ],
    "lines": [_line()],
  }


def _sequence() -> SequenceExecutionData:
  return {
    "id": "sequence_1",
    "sequence_node_id": "node_sequence_1",
    "status": "running",
    "current_terminal_index": 0,
    "created_at": "2026-03-05T00:00:00Z",
    "started_at": "2026-03-05T00:00:01Z",
    "finished_at": None,
    "terminal_jobs": [
      {
        "terminal_node_id": "node_terminal_1",
        "terminal_session_id": "term_1",
        "title": "Terminal",
        "terminal_type": "local",
        "status": "running",
      }
    ],
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

  def history(self) -> HistoryData:
    return {"runs": [_run()]}

  def snapshot(self) -> StateSnapshotData:
    return {"runs": [_run()], "terminals": [_terminal()], "sequences": [_sequence()]}


class TerminalRuntimeStub:
  def list_terminals(self) -> list[TerminalSessionData]:
    return [_terminal()]

  def list_sequences(self) -> list[SequenceExecutionData]:
    return [_sequence()]

  def get_terminal(self, terminal_session_id: str) -> TerminalSessionData:
    assert terminal_session_id == "term_1"
    return _terminal()

  async def create_terminal(self, payload: TerminalCreatePayload) -> TerminalSessionData:
    assert payload.title == "Terminal"
    return _terminal()

  async def execute_terminal(self, payload: TerminalExecutionPayload) -> TerminalSessionData:
    assert payload.terminal_node_id == "node_terminal_1"
    return _terminal()

  async def append_terminal_command(
    self,
    terminal_session_id: str,
    payload: TerminalAppendCommandPayload,
  ) -> TerminalSessionData:
    assert terminal_session_id == "term_1"
    assert payload.command == "pwd"
    return _terminal()

  async def stop_terminal(self, terminal_session_id: str) -> TerminalSessionData:
    assert terminal_session_id == "term_1"
    data = _terminal()
    data["status"] = "stopped"
    return data

  async def clear_terminal(self, terminal_session_id: str) -> TerminalSessionData:
    assert terminal_session_id == "term_1"
    data = _terminal()
    data["lines"] = []
    return data

  async def delete_terminal(self, terminal_session_id: str) -> None:
    assert terminal_session_id == "term_1"

  def get_sequence(self, sequence_id: str) -> SequenceExecutionData:
    assert sequence_id == "sequence_1"
    return _sequence()

  async def execute_sequence(self, payload: SequenceExecutionPayload) -> SequenceExecutionData:
    assert payload.sequence_node_id == "node_sequence_1"
    return _sequence()


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
  terminal_runtime = TerminalRuntimeStub()
  health_res = await health()
  state_res = await get_state(
    runtime=cast(RuntimeManager, runtime),
    terminal_runtime=cast("TerminalRuntimeManager", terminal_runtime),
  )
  history_res = await get_history(runtime=cast(RuntimeManager, runtime))

  assert health_res.status == "ok"
  assert state_res.runs[0].id == "run_1"
  assert state_res.terminals[0].id == "term_1"
  assert state_res.sequences[0].id == "sequence_1"
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
  log_response = await get_run_log("run_1", runtime=cast(RuntimeManager, runtime))
  log_text = await _read_response_text(log_response)

  assert runs_res.runs[0].id == "run_1"
  assert run_res.pipeline_name == "Pipeline"
  assert create_res.id == "run_1"
  assert stop_res.status == "stopped"
  assert log_text == "run-log"


@pytest.mark.asyncio
async def test_terminal_and_sequence_routes():
  runtime = TerminalRuntimeStub()

  terminals_res = await get_terminals(runtime=cast("TerminalRuntimeManager", runtime))
  terminal_res = await get_terminal("term_1", runtime=cast("TerminalRuntimeManager", runtime))
  create_terminal_res = await create_terminal(
    payload=TerminalCreatePayload(title="Terminal"),
    runtime=cast("TerminalRuntimeManager", runtime),
  )
  execute_terminal_res = await execute_terminal(
    payload=TerminalExecutionPayload(
      terminal_node_id="node_terminal_1",
      title="Terminal",
      commands=[
        TerminalCommandPayload(
          node_id="node_cmd_1",
          label="Run",
          original_command="echo 1",
          resolved_command="echo 1",
        )
      ],
    ),
    runtime=cast("TerminalRuntimeManager", runtime),
  )
  append_command_res = await append_terminal_command(
    "term_1",
    payload=TerminalAppendCommandPayload(command="pwd"),
    runtime=cast("TerminalRuntimeManager", runtime),
  )
  stop_terminal_res = await stop_terminal("term_1", runtime=cast("TerminalRuntimeManager", runtime))
  clear_terminal_res = await clear_terminal("term_1", runtime=cast("TerminalRuntimeManager", runtime))
  delete_terminal_res = await delete_terminal("term_1", runtime=cast("TerminalRuntimeManager", runtime))
  sequences_res = await get_sequences(runtime=cast("TerminalRuntimeManager", runtime))
  sequence_res = await get_sequence("sequence_1", runtime=cast("TerminalRuntimeManager", runtime))
  execute_sequence_res = await execute_sequence(
    payload=SequenceExecutionPayload(
      sequence_node_id="node_sequence_1",
      terminals=[
        TerminalExecutionPayload(
          terminal_node_id="node_terminal_1",
          title="Terminal",
          commands=[],
        )
      ],
    ),
    runtime=cast("TerminalRuntimeManager", runtime),
  )

  assert terminals_res.terminals[0].id == "term_1"
  assert terminal_res.id == "term_1"
  assert create_terminal_res.id == "term_1"
  assert execute_terminal_res.id == "term_1"
  assert append_command_res.id == "term_1"
  assert stop_terminal_res.status == "stopped"
  assert clear_terminal_res.lines == []
  assert delete_terminal_res.status_code == 204
  assert sequences_res.sequences[0].id == "sequence_1"
  assert sequence_res.id == "sequence_1"
  assert execute_sequence_res.id == "sequence_1"


@pytest.mark.asyncio
async def test_log_routes_return_empty_text_for_missing_files(tmp_path: Path):
  runtime = RuntimeStub()
  runtime.get_run_log_path = lambda _run_id: tmp_path / "missing-run.log"  # type: ignore[method-assign]

  run_log_response = await get_run_log("run_1", runtime=cast(RuntimeManager, runtime))

  assert await _read_response_text(run_log_response) == ""


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
async def test_command_pack_routes():
  manager = CommandPackManagerStub()

  list_res = await list_command_packs(manager=cast(CommandPackManager, manager))
  create_res = await create_command_template(
    payload=CommandTemplateCreatePayload(
      pack_id="custom",
      name="Cmd",
      command="echo 1",
      description="test",
    ),
    manager=cast(CommandPackManager, manager),
  )
  update_res = await update_command_template(
    template_id="custom:cmd_1",
    payload=CommandTemplateUpdatePayload(
      name="Cmd",
      command="echo 1",
      description="test",
    ),
    manager=cast(CommandPackManager, manager),
  )
  move_res = await move_command_template(
    template_id="custom:cmd_1",
    payload=CommandTemplateMovePayload(target_pack_id="core"),
    manager=cast(CommandPackManager, manager),
  )
  delete_res = await delete_command_template(
    template_id="custom:cmd_1",
    manager=cast(CommandPackManager, manager),
  )
  import_res = await import_command_pack(
    payload=CommandPackImportPayload(
      file_name="pack.json",
      content='{"pack_id":"custom","pack_name":"Custom","description":"desc","commands":[]}',
    ),
    manager=cast(CommandPackManager, manager),
  )

  assert list_res.packs[0].pack_id == "custom"
  assert create_res.pack_id == "custom"
  assert update_res.id == "custom:cmd_1"
  assert move_res.pack_id == "core"
  assert delete_res.deleted is True
  assert import_res.imported is True
