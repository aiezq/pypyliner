from __future__ import annotations

from typing import cast

import pytest

from src.app.api.routes.ai import (
    cancel_ai_model_install,
    generate_pipeline_draft,
    get_ai_model_status,
    install_ai_model,
    list_ai_models,
    load_ai_model,
    remove_ai_model,
    unload_ai_model,
)
from src.app.schemas.ai import (
    AIModelStatusResponse,
    AIModelsResponse,
    GeneratePipelineDraftRequest,
    GeneratePipelineDraftResponse,
)
from src.app.services.ai_models import AIModelManager
from src.app.services.pipeline_drafts import PipelineDraftGenerator


class AIModelManagerStub:
    async def list_models(self):
        return AIModelsResponse.model_validate({
            "runtime_name": "ollama",
            "runtime_available": True,
            "models": [
                {
                    "model_id": "gemma3",
                    "display_name": "Gemma 3",
                    "provider": "google",
                    "runtime": "ollama",
                    "install_ref": "gemma3",
                    "download_size_bytes": 3300000000,
                    "min_ram_gb": 8,
                    "recommended_ram_gb": 12,
                    "supports_json_mode": True,
                    "license": "Gemma license",
                    "status": "available",
                    "install_state": "installed",
                    "model_state": "ready",
                    "last_error": None,
                }
            ],
        })

    async def get_model_status(self, model_id: str):
        assert model_id == "gemma3"
        listed = await self.list_models()
        return AIModelStatusResponse.model_validate({
            "runtime_name": "ollama",
            "runtime_available": True,
            "model": listed.models[0].model_dump(),
        })

    async def install_model(self, model_id: str):
        payload = await self.get_model_status(model_id)
        return payload.model_copy(
            update={
                "model": payload.model.model_copy(
                    update={
                        "install_state": "installed",
                        "model_state": "installed",
                    }
                )
            }
        )

    async def load_model(self, model_id: str):
        return await self.get_model_status(model_id)

    async def cancel_install(self, model_id: str):
        payload = await self.get_model_status(model_id)
        return payload.model_copy(
            update={
                "model": payload.model.model_copy(
                    update={
                        "install_state": "not_installed",
                        "model_state": "not_installed",
                    }
                )
            }
        )

    async def unload_model(self, model_id: str):
        payload = await self.get_model_status(model_id)
        return payload.model_copy(
            update={
                "model": payload.model.model_copy(
                    update={
                        "install_state": "installed",
                        "model_state": "installed",
                    }
                )
            }
        )

    async def remove_model(self, model_id: str):
        payload = await self.get_model_status(model_id)
        return payload.model_copy(
            update={
                "model": payload.model.model_copy(
                    update={
                        "install_state": "not_installed",
                        "model_state": "not_installed",
                    }
                )
            }
        )


class PipelineDraftGeneratorStub:
    async def generate(self, payload: GeneratePipelineDraftRequest):
        assert payload.model_id == "gemma3"
        return GeneratePipelineDraftResponse.model_validate({
            "draft": {
                "flow_name": "Generated flow",
                "summary": "summary",
                "assumptions": ["Docs omitted environment details."],
                "warnings": [],
                "variables": [],
                "steps": [],
                "target_terminal": {"type": "local", "connection_hint": None},
                "confidence": 0.5,
            },
            "warnings": [],
            "install_state": "installed",
            "model_state": "ready",
        })


@pytest.mark.asyncio
async def test_ai_model_lifecycle_routes() -> None:
    manager = AIModelManagerStub()

    listed = await list_ai_models(manager=cast(AIModelManager, manager))
    installed = await install_ai_model("gemma3", manager=cast(AIModelManager, manager))
    status = await get_ai_model_status("gemma3", manager=cast(AIModelManager, manager))
    cancelled = await cancel_ai_model_install("gemma3", manager=cast(AIModelManager, manager))
    loaded = await load_ai_model("gemma3", manager=cast(AIModelManager, manager))
    unloaded = await unload_ai_model("gemma3", manager=cast(AIModelManager, manager))
    removed = await remove_ai_model("gemma3", manager=cast(AIModelManager, manager))

    assert listed.models[0].model_id == "gemma3"
    assert installed.model.model_state == "installed"
    assert status.model.install_state == "installed"
    assert cancelled.model.install_state == "not_installed"
    assert loaded.model.model_state == "ready"
    assert unloaded.model.model_state == "installed"
    assert removed.model.install_state == "not_installed"


@pytest.mark.asyncio
async def test_generate_pipeline_draft_route() -> None:
    generator = PipelineDraftGeneratorStub()

    response = await generate_pipeline_draft(
        payload=GeneratePipelineDraftRequest(
            model_id="gemma3",
            documentation_text="Generate a simple local workflow.",
        ),
        generator=cast(PipelineDraftGenerator, generator),
    )

    assert response.draft.flow_name == "Generated flow"
    assert response.install_state == "installed"
