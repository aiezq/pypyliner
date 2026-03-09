from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from src.app.schemas.ai import GeneratePipelineDraftRequest, PipelineDraft
from src.app.services.ai_models import AIModelManager
from src.app.services.ai_runtime import RuntimePullCancelledError, RuntimePullOperation
from src.app.services.pipeline_drafts import PipelineDraftGenerator, classify_command_risks


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
        )
    )

    assert response.draft.flow_name == "Deploy app"
    assert response.model_state == "ready"
    assert any("Risk: sudo" in warning for warning in response.warnings)
    assert any("Risk: systemctl" in warning for warning in response.warnings)


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
                }
            ],
            "target_terminal": {"type": "local", "connection_hint": None},
            "confidence": 0.8,
        }
    )

    assert draft.variables[0].name == "log_path"


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
