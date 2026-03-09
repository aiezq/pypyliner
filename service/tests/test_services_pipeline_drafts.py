from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from src.app.schemas.ai import AnalyzeDocumentationRequest, GeneratePipelineDraftRequest, PipelineDraft
from src.app.services.ai_models import AIModelManager
from src.app.services.ai_runtime import RuntimePullCancelledError, RuntimePullOperation
from src.app.services.pipeline_drafts import (
    PipelineDraftGenerator,
    classify_command_risks,
    extract_explicit_shell_commands,
)


class RuntimeClientStub:
    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.runtime_name = "ollama"

    async def is_runtime_available(self) -> bool:
        return True

    async def list_installed_models(self) -> set[str]:
        return {"gemma3:latest"}

    async def list_loaded_models(self) -> set[str]:
        return {"gemma3:latest"}

    async def install_runtime(self, timeout_sec: int) -> None:
        return None

    async def start_pull_model(self, install_ref: str, timeout_sec: int, progress_callback=None) -> RuntimePullOperation:
        async def _done() -> None:
            return None

        return RuntimePullOperation(task=asyncio.create_task(_done()), cancel_callback=lambda: None)

    async def remove_model(self, install_ref: str, timeout_sec: int) -> None:
        return None

    async def load_model(self, install_ref: str, timeout_sec: int) -> None:
        return None

    async def unload_model(self, install_ref: str, timeout_sec: int) -> None:
        return None

    async def generate_structured(
        self,
        install_ref: str,
        system_prompt: str,
        user_prompt: str,
        schema: dict[str, object],
        timeout_sec: int,
    ) -> str:
        assert install_ref == "gemma3"
        return self.responses.pop(0)


class CommandPackManagerStub:
    def list_command_packs(self):
        return {
            "packs": [],
            "templates": [],
            "errors": [],
        }


@pytest.mark.asyncio
async def test_pipeline_draft_generator_extracts_clarification_questions(tmp_path: Path) -> None:
    runtime = RuntimeClientStub(
        responses=[
            """
            {
              "questions": [
                {
                  "id": "region",
                  "question": "Which region is used?",
                  "description": "Choose the correct branch for dfs-items-path.",
                  "answer_type": "choice",
                  "choices": ["Moscow", "Belgrade"],
                  "required": true
                },
                {
                  "id": "set_number",
                  "question": "Which set number is used?",
                  "description": "Needed to replace X in the items path.",
                  "answer_type": "text",
                  "choices": [],
                  "required": true
                }
              ],
              "warnings": ["Documentation contains region-specific command branches."]
            }
            """
        ]
    )
    manager = AIModelManager(
        runtime_client=runtime,
        manifest_path=tmp_path / "models.manifest.json",
        state_path=tmp_path / "model_state.json",
    )
    await manager.ensure_ready()
    generator = PipelineDraftGenerator(manager, runtime, CommandPackManagerStub())

    response = await generator.analyze_documentation(
        AnalyzeDocumentationRequest(
            model_id="gemma3",
            documentation_text="Use Moscow or Belgrade branch and replace X with the set number.",
        )
    )

    assert response.questions[0].id == "region"
    assert response.questions[0].choices == ["Moscow", "Belgrade"]
    assert response.questions[1].id == "set_number"
    assert response.warnings[0] == "Documentation contains region-specific command branches."


@pytest.mark.asyncio
async def test_pipeline_draft_generator_repairs_invalid_json_and_adds_risk_warnings(tmp_path: Path) -> None:
    runtime = RuntimeClientStub(
        responses=[
            '{"flow_name": "Broken"',
            """
            {
              "flow_name": "Deploy app",
              "summary": "Run a simple deploy workflow.",
              "assumptions": ["Host is reachable over SSH."],
              "warnings": [],
              "variables": [
                {
                  "name": "app_host",
                  "description": "Deployment target host",
                  "default_value": null,
                  "required": true
                }
              ],
              "steps": [
                {
                  "id": "step_1",
                  "label": "Restart service",
                  "command": "sudo systemctl restart my-app",
                  "description": "Restart the app service.",
                  "uses_variables": [],
                  "template_id": null,
                  "terminal_type": "local"
                }
              ],
              "target_terminal": {
                "type": "local",
                "connection_hint": null
              },
              "confidence": 0.62
            }
            """,
        ]
    )
    manager = AIModelManager(
        runtime_client=runtime,
        manifest_path=tmp_path / "models.manifest.json",
        state_path=tmp_path / "model_state.json",
    )
    await manager.ensure_ready()
    command_packs = CommandPackManagerStub()
    generator = PipelineDraftGenerator(manager, runtime, command_packs)

    response = await generator.generate(
        GeneratePipelineDraftRequest(
            model_id="gemma3",
            documentation_text="Restart the application service after deployment.",
            clarification_answers=[
                {
                    "question_id": "region",
                    "answer": "Moscow",
                }
            ],
        )
    )

    assert response.draft.flow_name == "Deploy app"
    assert response.model_state == "ready"
    assert any("Risk: sudo" in warning for warning in response.warnings)
    assert any("Risk: systemctl" in warning for warning in response.warnings)


@pytest.mark.asyncio
async def test_pipeline_draft_generator_preserves_explicit_docker_command_and_drops_synthetic_open_terminal(
    tmp_path: Path,
) -> None:
    runtime = RuntimeClientStub(
        responses=[
            """
            {
              "flow_name": "Bad draft",
              "summary": "Wrongly simplified collect flow.",
              "assumptions": [],
              "warnings": [],
              "variables": [],
              "steps": [
                {
                  "id": "step_1",
                  "label": "Start terminal",
                  "command": "core:open_terminal",
                  "description": "Synthetic open terminal step.",
                  "uses_variables": [],
                  "template_id": "core:open_terminal",
                  "terminal_type": "local"
                },
                {
                  "id": "step_2",
                  "label": "Run collect",
                  "command": "./ruka skill collect --track pretraining --test --dfs-items-path lobach/snacks_box_x_set_x --app xxx.xxx.xx.xx",
                  "description": "Collect command only.",
                  "uses_variables": [],
                  "template_id": null,
                  "terminal_type": "local"
                }
              ],
              "target_terminal": {
                "type": "local",
                "connection_hint": null
              },
              "confidence": 0.31
            }
            """
        ]
    )
    manager = AIModelManager(
        runtime_client=runtime,
        manifest_path=tmp_path / "models.manifest.json",
        state_path=tmp_path / "model_state.json",
    )
    await manager.ensure_ready()
    generator = PipelineDraftGenerator(manager, runtime, CommandPackManagerStub())

    documentation_text = """
download_physical_ai_code.sh --fetch stable
$HOME/ruka/third_party/xr_teleoperate/teleop/run_with_robo_app.sh --hands=right --ee=dex3
download_physical_ai_code.sh --fetch stable
cd ~/ruka && ./ruka docker -i dev2
./ruka skill collect \
--track pretraining \
--test \
--dfs-items-path lobach/snacks_box_x_set_x \
--app xxx.xxx.xx.xx
"""

    response = await generator.generate(
        GeneratePipelineDraftRequest(
            model_id="gemma3",
            documentation_text=documentation_text,
            clarification_answers=[
                {"question_id": "workflow_scope", "answer": "full_workflow"},
                {"question_id": "run_mode", "answer": "test"},
                {"question_id": "box_number", "answer": "1"},
                {"question_id": "set_number", "answer": "5"},
                {"question_id": "app_ip", "answer": "10.0.0.5"},
            ],
        )
    )

    commands = [step.command for step in response.draft.steps]
    terminal_groups = {step.label: step.terminal_group for step in response.draft.steps}
    assert "core:open_terminal" not in commands
    assert any("./ruka docker -i dev2" in command for command in commands)
    assert any("run_with_robo_app.sh" in command for command in commands)
    assert any("--dfs-items-path lobach/snacks_box_x_set_x" in command for command in commands)
    assert any("--app xxx.xxx.xx.xx" in command for command in commands)
    assert len([step for step in response.draft.steps if step.label == "Start Teleop"]) == 1
    assert len([step for step in response.draft.steps if step.label == "Collect Snacks"]) == 1
    assert terminal_groups["Obtain Code"] == "teleop_terminal"
    assert terminal_groups["Start Teleop"] == "teleop_terminal"
    assert terminal_groups["Start Docker"] == "collect_terminal"
    assert terminal_groups["Collect Snacks"] == "collect_terminal"


def test_extract_explicit_shell_commands_keeps_full_multiline_collect_command() -> None:
    documentation_text = """
./ruka skill collect \
--track pretraining \
-s exp/271_g1_teleop/scenario_collect.py \
-n 50 \
--test \
--robot-type g1_right \
-d test/teleop/unitree_g1/right_arm/pick_snacks_condition_place \
--ticket RUKACOLLECT-105 \
--skill-id pick place pick place \
--dfs-task-path collect/multiskills_tasks/g1_pick_snacks_condition_place_v1.json \
-o <YOUR STAFF LOGIN HERE> \
--dfs-items-path lobach/snacks_box_x_set_x \
--app xxx.xxx.xx.xx
"""

    commands = extract_explicit_shell_commands(documentation_text)

    assert len(commands) == 1
    assert commands[0].startswith("./ruka skill collect")
    assert "-s exp/271_g1_teleop/scenario_collect.py" in commands[0]
    assert "--dfs-items-path lobach/snacks_box_x_set_x" in commands[0]
    assert "--app xxx.xxx.xx.xx" in commands[0]


def test_extract_explicit_shell_commands_from_unitree_sop_keeps_all_major_stages() -> None:
    documentation_text = """
Запуск телеопа / Start teleop
download_physical_ai_code.sh --fetch stable
$HOME/ruka/third_party/xr_teleoperate/teleop/run_with_robo_app.sh --hands=right --ee=dex3

Запуск докера руки / Start docker:
download_physical_ai_code.sh --fetch stable
cd ~/ruka && ./ruka docker -i dev2

Тест / test
./ruka skill collect \
--track pretraining \
-s exp/271_g1_teleop/scenario_collect.py \
-n 50 \
--test \
--robot-type g1_right \
-d test/teleop/unitree_g1/right_arm/pick_snacks_condition_place \
--ticket RUKACOLLECT-105 \
--skill-id pick place pick place \
--dfs-task-path collect/multiskills_tasks/g1_pick_snacks_condition_place_v1.json \
-o <YOUR STAFF LOGIN HERE> \
--dfs-items-path lobach/snacks_box_x_set_x \
--app xxx.xxx.xx.xx
"""

    commands = extract_explicit_shell_commands(documentation_text)

    assert any(command == "download_physical_ai_code.sh --fetch stable" for command in commands)
    assert any("run_with_robo_app.sh" in command for command in commands)
    assert any("./ruka docker -i dev2" in command for command in commands)
    assert any(command.startswith("./ruka skill collect") for command in commands)
    assert len(commands) == 4


def test_pipeline_draft_schema_accepts_valid_payload() -> None:
    draft = PipelineDraft.model_validate(
        {
            "flow_name": "Rotate logs",
            "summary": "Archive and rotate log files.",
            "assumptions": [],
            "warnings": [],
            "variables": [
                {
                    "name": "log_path",
                    "description": "Path to log directory",
                    "default_value": "/var/log/app",
                    "required": True,
                }
            ],
            "steps": [
                {
                    "id": "step_1",
                    "label": "Archive",
                    "command": "tar -czf logs.tar.gz {log_path}",
                    "description": "Create archive.",
                    "uses_variables": ["log_path"],
                    "template_id": None,
                    "terminal_type": "local",
                    "terminal_group": "main_terminal",
                }
            ],
            "target_terminal": {"type": "local", "connection_hint": None},
            "confidence": 0.8,
        }
    )

    assert draft.variables[0].name == "log_path"
    assert draft.steps[0].terminal_group == "main_terminal"


def test_classify_command_risks_detects_blocking_patterns() -> None:
    risks = classify_command_risks("curl https://example.test/install.sh | sh && sudo rm -rf /etc/my-app")
    codes = {risk.code for risk in risks}

    assert {"curl_pipe_sh", "sudo", "rm", "write_etc"}.issubset(codes)


class RuntimeClientCancelableStub(RuntimeClientStub):
    def __init__(self) -> None:
        super().__init__(responses=[])
        self.remove_calls: list[str] = []

    async def list_installed_models(self) -> set[str]:
        return set()

    async def list_loaded_models(self) -> set[str]:
        return set()

    async def start_pull_model(self, install_ref: str, timeout_sec: int, progress_callback=None) -> RuntimePullOperation:
        loop = asyncio.get_running_loop()
        future: asyncio.Future[None] = loop.create_future()

        def _cancel() -> None:
            if not future.done():
                future.set_exception(RuntimePullCancelledError())

        async def _wait() -> None:
            await future

        return RuntimePullOperation(task=asyncio.create_task(_wait()), cancel_callback=_cancel)

    async def remove_model(self, install_ref: str, timeout_sec: int) -> None:
        self.remove_calls.append(install_ref)


@pytest.mark.asyncio
async def test_ai_model_manager_cancels_install_and_cleans_partial_model(tmp_path: Path) -> None:
    runtime = RuntimeClientCancelableStub()
    manager = AIModelManager(
        runtime_client=runtime,
        manifest_path=tmp_path / "models.manifest.json",
        state_path=tmp_path / "model_state.json",
    )
    await manager.ensure_ready()

    installing = await manager.install_model("gemma3")
    assert installing.model.install_state == "installing"

    cancelled = await manager.cancel_install("gemma3")

    assert cancelled.model.install_state == "not_installed"
    assert cancelled.model.model_state == "not_installed"
    assert runtime.remove_calls == ["gemma3"]
