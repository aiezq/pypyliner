from __future__ import annotations

import asyncio
import contextlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, cast

from src.app.core.settings import get_settings
from src.app.schemas.ai import (
    AIInstallState,
    AIModelManifestEntry,
    AIModelState,
    AIModelStatusResponse,
    AIModelSummary,
    AIModelsResponse,
)
from src.app.services.ai_runtime import (
    AIRuntimeClient,
    RuntimePullCancelledError,
    RuntimePullOperation,
    RuntimePullProgress,
)
from src.app.services.runtime import ServiceError, now_iso

DEFAULT_MODEL_MANIFEST: list[dict[str, object]] = [
    {
        "model_id": "gemma3",
        "display_name": "Gemma 3",
        "provider": "google",
        "runtime": "ollama",
        "install_ref": "gemma3",
        "download_size_bytes": 3_300_000_000,
        "min_ram_gb": 8,
        "recommended_ram_gb": 12,
        "supports_json_mode": True,
        "license": "Gemma license",
        "status": "available",
    },
    {
        "model_id": "gpt-oss-20b",
        "display_name": "GPT OSS 20B",
        "provider": "openai",
        "runtime": "ollama",
        "install_ref": "gpt-oss:20b",
        "download_size_bytes": 13_000_000_000,
        "min_ram_gb": 16,
        "recommended_ram_gb": 24,
        "supports_json_mode": True,
        "license": "Apache-2.0",
        "status": "available",
    },
]

TRANSIENT_INSTALL_STATES = {"installing", "removing"}
TRANSIENT_MODEL_STATES = {"loading"}


@dataclass(slots=True)
class PersistedModelState:
    install_state: AIInstallState = "not_installed"
    model_state: AIModelState = "not_installed"
    last_error: str | None = None
    updated_at: str | None = None
    progress_status: str | None = None
    progress_completed_bytes: int | None = None
    progress_total_bytes: int | None = None
    progress_percent: float | None = None


class AIModelManager:
    def __init__(
        self,
        runtime_client: AIRuntimeClient,
        manifest_path: Path | None = None,
        state_path: Path | None = None,
    ) -> None:
        settings = get_settings()
        self._settings = settings
        self._runtime = runtime_client
        self._ai_data_dir = settings.ai_data_dir
        self._manifest_path = manifest_path or (
            Path(__file__).resolve().parents[1] / "assets" / "ai" / "models.manifest.json"
        )
        self._state_path = state_path or (self._ai_data_dir / "model_state.json")
        self._install_tasks: dict[str, asyncio.Task[None]] = {}
        self._pull_operations: dict[str, RuntimePullOperation] = {}
        self._cancel_requested: set[str] = set()

    async def ensure_ready(self) -> None:
        self._ai_data_dir.mkdir(parents=True, exist_ok=True)
        if not self._manifest_path.exists():
            self._manifest_path.parent.mkdir(parents=True, exist_ok=True)
            self._manifest_path.write_text(json.dumps(DEFAULT_MODEL_MANIFEST, indent=2), encoding="utf-8")
        if not self._state_path.exists():
            self._state_path.write_text("{}", encoding="utf-8")

    async def list_models(self) -> AIModelsResponse:
        runtime_available = await self._runtime.is_runtime_available()
        installed: set[str] = await self._runtime.list_installed_models() if runtime_available else set()
        loaded: set[str] = await self._runtime.list_loaded_models() if runtime_available else set()
        state_map = self._read_state_map()

        models = [
            self._build_summary(
                manifest=manifest,
                installed_models=installed,
                loaded_models=loaded,
                persisted_state=state_map.get(manifest.model_id, PersistedModelState()),
            )
            for manifest in self._read_manifest()
        ]
        return AIModelsResponse(
            runtime_name=self._settings.ai_runtime,
            runtime_available=runtime_available,
            models=models,
        )

    async def get_model_status(self, model_id: str) -> AIModelStatusResponse:
        manifest = self._get_manifest_entry(model_id)
        runtime_available = await self._runtime.is_runtime_available()
        installed: set[str] = await self._runtime.list_installed_models() if runtime_available else set()
        loaded: set[str] = await self._runtime.list_loaded_models() if runtime_available else set()
        persisted = self._read_state_map().get(model_id, PersistedModelState())

        return AIModelStatusResponse(
            runtime_name=self._settings.ai_runtime,
            runtime_available=runtime_available,
            model=self._build_summary(
                manifest=manifest,
                installed_models=installed,
                loaded_models=loaded,
                persisted_state=persisted,
            ),
        )

    async def install_model(self, model_id: str) -> AIModelStatusResponse:
        manifest = self._get_manifest_entry(model_id)
        current = await self.get_model_status(model_id)
        if current.model.install_state == "installed":
            return current
        existing_task = self._install_tasks.get(model_id)
        if existing_task is not None and not existing_task.done():
            return await self.get_model_status(model_id)

        self._write_model_state(
            model_id,
            install_state="installing",
            model_state=current.model.model_state,
            progress_status="Queued for installation.",
            progress_completed_bytes=0,
            progress_total_bytes=manifest.download_size_bytes,
            progress_percent=0.0,
        )
        task = asyncio.create_task(self._run_install(model_id, manifest, current.runtime_available))
        self._install_tasks[model_id] = task
        return await self.get_model_status(model_id)

    async def load_model(self, model_id: str) -> AIModelStatusResponse:
        manifest = self._get_manifest_entry(model_id)
        status = await self.get_model_status(model_id)
        if status.model.install_state != "installed":
            raise ServiceError(status_code=409, detail=f"Model '{model_id}' is not installed.")
        if status.model.model_state == "ready":
            return status

        self._write_model_state(model_id, install_state="installed", model_state="loading", last_error=None)
        try:
            await self._runtime.load_model(manifest.install_ref, timeout_sec=self._settings.ai_request_timeout_sec)
        except ServiceError as error:
            self._write_model_state(
                model_id,
                install_state="installed",
                model_state="failed",
                last_error=error.detail,
            )
            raise

        self._write_model_state(model_id, install_state="installed", model_state="ready", last_error=None)
        return await self.get_model_status(model_id)

    async def cancel_install(self, model_id: str) -> AIModelStatusResponse:
        manifest = self._get_manifest_entry(model_id)
        status = await self.get_model_status(model_id)
        if status.model.install_state != "installing":
            raise ServiceError(status_code=409, detail=f"Model '{model_id}' is not currently installing.")

        self._cancel_requested.add(model_id)
        self._write_model_state(
            model_id,
            install_state="removing",
            model_state="not_installed",
            last_error=None,
            progress_status="Cancelling download and cleaning partial files...",
            progress_completed_bytes=status.model.progress_completed_bytes,
            progress_total_bytes=status.model.progress_total_bytes,
            progress_percent=status.model.progress_percent,
        )

        pull_operation = self._pull_operations.get(model_id)
        if pull_operation is not None:
            await pull_operation.cancel()

        install_task = self._install_tasks.get(model_id)
        if install_task is not None:
            with contextlib.suppress(asyncio.CancelledError, RuntimePullCancelledError):
                await install_task

        try:
            await self._runtime.remove_model(manifest.install_ref, timeout_sec=self._settings.ai_request_timeout_sec)
        except ServiceError:
            # The model may not exist yet if cancellation happened early.
            pass
        finally:
            self._cancel_requested.discard(model_id)
            self._pull_operations.pop(model_id, None)
            self._install_tasks.pop(model_id, None)

        self._write_model_state(
            model_id,
            install_state="not_installed",
            model_state="not_installed",
            last_error=None,
            progress_status=None,
            progress_completed_bytes=None,
            progress_total_bytes=None,
            progress_percent=None,
        )
        return await self.get_model_status(model_id)

    async def unload_model(self, model_id: str) -> AIModelStatusResponse:
        manifest = self._get_manifest_entry(model_id)
        status = await self.get_model_status(model_id)
        if status.model.install_state != "installed":
            raise ServiceError(status_code=409, detail=f"Model '{model_id}' is not installed.")
        if status.model.model_state != "ready":
            return status

        try:
            await self._runtime.unload_model(manifest.install_ref, timeout_sec=self._settings.ai_request_timeout_sec)
        except ServiceError as error:
            self._write_model_state(
                model_id,
                install_state="installed",
                model_state="failed",
                last_error=error.detail,
                progress_status=None,
                progress_completed_bytes=None,
                progress_total_bytes=None,
                progress_percent=None,
            )
            raise

        self._write_model_state(
            model_id,
            install_state="installed",
            model_state="installed",
            last_error=None,
            progress_status=None,
            progress_completed_bytes=None,
            progress_total_bytes=None,
            progress_percent=None,
        )
        return await self.get_model_status(model_id)

    async def remove_model(self, model_id: str) -> AIModelStatusResponse:
        manifest = self._get_manifest_entry(model_id)
        status = await self.get_model_status(model_id)
        if status.model.install_state == "not_installed":
            return status

        self._write_model_state(model_id, install_state="removing", model_state="installed", last_error=None)
        try:
            await self._runtime.remove_model(manifest.install_ref, timeout_sec=self._settings.ai_request_timeout_sec)
        except ServiceError as error:
            self._write_model_state(
                model_id,
                install_state="failed",
                model_state="failed",
                last_error=error.detail,
                progress_status=None,
                progress_completed_bytes=None,
                progress_total_bytes=None,
                progress_percent=None,
            )
            raise

        self._write_model_state(
            model_id,
            install_state="not_installed",
            model_state="not_installed",
            last_error=None,
            progress_status=None,
            progress_completed_bytes=None,
            progress_total_bytes=None,
            progress_percent=None,
        )
        return await self.get_model_status(model_id)

    async def _run_install(
        self,
        model_id: str,
        manifest: AIModelManifestEntry,
        runtime_available: bool,
    ) -> None:
        try:
            if not runtime_available:
                self._write_model_state(
                    model_id,
                    install_state="installing",
                    model_state="not_installed",
                    last_error=None,
                    progress_status="Installing Ollama runtime...",
                    progress_completed_bytes=None,
                    progress_total_bytes=None,
                    progress_percent=None,
                )
                await self._runtime.install_runtime(timeout_sec=self._settings.ai_install_timeout_sec)

            self._write_model_state(
                model_id,
                install_state="installing",
                model_state="not_installed",
                last_error=None,
                progress_status=f"Starting model download for {manifest.display_name}...",
                progress_completed_bytes=0,
                progress_total_bytes=manifest.download_size_bytes,
                progress_percent=0.0,
            )

            def _on_progress(progress: RuntimePullProgress) -> None:
                total = progress.total if progress.total and progress.total > 0 else manifest.download_size_bytes
                completed = progress.completed if progress.completed is not None else None
                percent = None
                if completed is not None and total:
                    percent = min(100.0, max(0.0, (completed / total) * 100))
                self._write_model_state(
                    model_id,
                    install_state="installing",
                    model_state="not_installed",
                    last_error=None,
                    progress_status=progress.status or f"Downloading {manifest.display_name}...",
                    progress_completed_bytes=completed,
                    progress_total_bytes=total,
                    progress_percent=percent,
                )

            pull_operation = await self._runtime.start_pull_model(
                manifest.install_ref,
                timeout_sec=self._settings.ai_install_timeout_sec,
                progress_callback=_on_progress,
            )
            self._pull_operations[model_id] = pull_operation
            await pull_operation.wait()
        except RuntimePullCancelledError:
            if model_id in self._cancel_requested:
                return
            self._write_model_state(
                model_id,
                install_state="failed",
                model_state="failed",
                last_error="Model download was interrupted.",
                progress_status=None,
                progress_completed_bytes=None,
                progress_total_bytes=None,
                progress_percent=None,
            )
            return
        except asyncio.CancelledError:
            if model_id in self._cancel_requested:
                return
            raise
        except ServiceError as error:
            self._write_model_state(
                model_id,
                install_state="failed",
                model_state="failed",
                last_error=error.detail,
                progress_status=None,
                progress_completed_bytes=None,
                progress_total_bytes=None,
                progress_percent=None,
            )
            return
        except Exception as error:
            self._write_model_state(
                model_id,
                install_state="failed",
                model_state="failed",
                last_error=str(error),
                progress_status=None,
                progress_completed_bytes=None,
                progress_total_bytes=None,
                progress_percent=None,
            )
            return
        finally:
            self._pull_operations.pop(model_id, None)
            self._install_tasks.pop(model_id, None)

        self._write_model_state(
            model_id,
            install_state="installed",
            model_state="installed",
            last_error=None,
            progress_status="Download complete.",
            progress_completed_bytes=manifest.download_size_bytes,
            progress_total_bytes=manifest.download_size_bytes,
            progress_percent=100.0,
        )

    def get_manifest_entry(self, model_id: str) -> AIModelManifestEntry:
        return self._get_manifest_entry(model_id)

    def _get_manifest_entry(self, model_id: str) -> AIModelManifestEntry:
        for manifest in self._read_manifest():
            if manifest.model_id == model_id:
                return manifest
        raise ServiceError(status_code=404, detail=f"Unknown AI model '{model_id}'.")

    def _read_manifest(self) -> list[AIModelManifestEntry]:
        try:
            raw = json.loads(self._manifest_path.read_text(encoding="utf-8"))
        except FileNotFoundError as error:
            raise ServiceError(status_code=500, detail="AI model manifest is missing.") from error
        except json.JSONDecodeError as error:
            raise ServiceError(status_code=500, detail="AI model manifest is invalid JSON.") from error
        if not isinstance(raw, list):
            raise ServiceError(status_code=500, detail="AI model manifest must be a list.")
        raw_items = cast(list[object], raw)
        return [AIModelManifestEntry.model_validate(item) for item in raw_items]

    def _read_state_map(self) -> dict[str, PersistedModelState]:
        try:
            raw = json.loads(self._state_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {}
        except json.JSONDecodeError:
            return {}
        if not isinstance(raw, dict):
            return {}
        raw_state = cast(dict[object, object], raw)
        result: dict[str, PersistedModelState] = {}
        for model_id, payload in raw_state.items():
            if isinstance(model_id, str) and isinstance(payload, dict):
                payload_dict = cast(dict[str, Any], payload)
                result[model_id] = PersistedModelState(**payload_dict)
        return result

    def _write_model_state(
        self,
        model_id: str,
        install_state: AIInstallState,
        model_state: AIModelState,
        last_error: str | None = None,
        progress_status: str | None = None,
        progress_completed_bytes: int | None = None,
        progress_total_bytes: int | None = None,
        progress_percent: float | None = None,
    ) -> None:
        state_map = self._read_state_map()
        state_map[model_id] = PersistedModelState(
            install_state=install_state,
            model_state=model_state,
            last_error=last_error,
            updated_at=now_iso(),
            progress_status=progress_status,
            progress_completed_bytes=progress_completed_bytes,
            progress_total_bytes=progress_total_bytes,
            progress_percent=progress_percent,
        )
        serialized = {key: asdict(value) for key, value in state_map.items()}
        self._state_path.write_text(json.dumps(serialized, indent=2), encoding="utf-8")

    @staticmethod
    def _install_aliases(install_ref: str) -> set[str]:
        aliases = {install_ref}
        if ":" not in install_ref:
            aliases.add(f"{install_ref}:latest")
        return aliases

    def _build_summary(
        self,
        manifest: AIModelManifestEntry,
        installed_models: set[str],
        loaded_models: set[str],
        persisted_state: PersistedModelState,
    ) -> AIModelSummary:
        aliases = self._install_aliases(manifest.install_ref)
        is_installed = bool(installed_models.intersection(aliases))
        is_loaded = bool(loaded_models.intersection(aliases))

        install_state = persisted_state.install_state
        if install_state not in TRANSIENT_INSTALL_STATES:
            install_state = "installed" if is_installed else "not_installed"
        if persisted_state.install_state == "failed" and not is_installed:
            install_state = "failed"

        if persisted_state.model_state == "failed" and not is_loaded:
            model_state: AIModelState = "failed"
        elif persisted_state.model_state in TRANSIENT_MODEL_STATES and is_installed and not is_loaded:
            model_state = persisted_state.model_state
        else:
            model_state = "ready" if is_loaded else ("installed" if is_installed else "not_installed")

        return AIModelSummary(
            **manifest.model_dump(),
            install_state=install_state,
            model_state=model_state,
            last_error=persisted_state.last_error,
            progress_status=persisted_state.progress_status,
            progress_completed_bytes=persisted_state.progress_completed_bytes,
            progress_total_bytes=persisted_state.progress_total_bytes,
            progress_percent=persisted_state.progress_percent,
        )
