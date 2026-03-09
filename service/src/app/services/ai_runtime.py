from __future__ import annotations

import asyncio
import contextlib
import json
import platform
import shutil
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Protocol

from src.app.core.settings import get_settings
from src.app.services.runtime import ServiceError

OLLAMA_API_URL = "http://127.0.0.1:11434"
OLLAMA_MACOS_APP_PATH = Path("/Applications/Ollama.app")
OLLAMA_MACOS_CLI_PATH = OLLAMA_MACOS_APP_PATH / "Contents" / "Resources" / "ollama"


@dataclass(slots=True)
class RuntimeCommandResult:
    returncode: int
    stdout: str
    stderr: str


@dataclass(slots=True)
class RuntimePullProgress:
    status: str
    completed: int | None = None
    total: int | None = None


class RuntimePullCancelledError(Exception):
    pass


@dataclass(slots=True)
class RuntimePullOperation:
    task: asyncio.Task[None]
    cancel_callback: Callable[[], None]

    async def wait(self) -> None:
        await self.task

    async def cancel(self) -> None:
        self.cancel_callback()
        with contextlib.suppress(RuntimePullCancelledError, asyncio.CancelledError):
            await self.task


class AIRuntimeClient(Protocol):
    runtime_name: str

    async def is_runtime_available(self) -> bool: ...

    async def install_runtime(self, timeout_sec: int) -> None: ...

    async def list_installed_models(self) -> set[str]: ...

    async def list_loaded_models(self) -> set[str]: ...

    async def start_pull_model(
        self,
        install_ref: str,
        timeout_sec: int,
        progress_callback: Callable[[RuntimePullProgress], None] | None = None,
    ) -> RuntimePullOperation: ...

    async def remove_model(self, install_ref: str, timeout_sec: int) -> None: ...

    async def load_model(self, install_ref: str, timeout_sec: int) -> None: ...

    async def unload_model(self, install_ref: str, timeout_sec: int) -> None: ...

    async def generate_structured(
        self,
        install_ref: str,
        system_prompt: str,
        user_prompt: str,
        schema: dict[str, Any],
        timeout_sec: int,
    ) -> str: ...


class OllamaRuntimeClient:
    runtime_name = "ollama"

    async def is_runtime_available(self) -> bool:
        executable = self._resolve_ollama_executable()
        if executable is None:
            return False
        result = await self._run_exec([executable, "--version"], timeout_sec=10, check=False)
        return result.returncode == 0

    async def install_runtime(self, timeout_sec: int) -> None:
        if await self.is_runtime_available():
            return

        current_platform = platform.system().lower()
        if current_platform not in {"linux", "darwin"}:
            raise ServiceError(
                status_code=501,
                detail="Automatic Ollama runtime installation is supported only on Linux and macOS.",
            )

        command = "curl -fsSL https://ollama.com/install.sh | sh"
        result = await self._run_shell(command, timeout_sec=timeout_sec, check=False)

        if current_platform == "darwin" and OLLAMA_MACOS_APP_PATH.exists():
            await self._start_macos_app(timeout_sec=min(timeout_sec, 120))
            if self._resolve_ollama_executable() is not None:
                return

        if result.returncode != 0:
            raise ServiceError(
                status_code=502,
                detail=(
                    "Failed to install Ollama runtime. "
                    f"{self._clean_error(result.stderr or result.stdout)}"
                ),
            )

    async def list_installed_models(self) -> set[str]:
        if not await self.is_runtime_available():
            return set()

        executable = self._require_executable()
        result = await self._run_exec([executable, "list"], timeout_sec=30, check=False)
        if result.returncode != 0:
            return set()
        return self._parse_table_first_column(result.stdout)

    async def list_loaded_models(self) -> set[str]:
        if not await self.is_runtime_available():
            return set()

        executable = self._require_executable()
        result = await self._run_exec([executable, "ps"], timeout_sec=30, check=False)
        if result.returncode != 0:
            return set()
        return self._parse_table_first_column(result.stdout)

    async def start_pull_model(
        self,
        install_ref: str,
        timeout_sec: int,
        progress_callback: Callable[[RuntimePullProgress], None] | None = None,
    ) -> RuntimePullOperation:
        return self._start_post_json_stream(
            "/api/pull",
            {
                "model": install_ref,
                "stream": True,
            },
            timeout_sec=timeout_sec,
            progress_callback=progress_callback,
        )

    async def remove_model(self, install_ref: str, timeout_sec: int) -> None:
        executable = self._require_executable()
        await self._run_exec([executable, "rm", install_ref], timeout_sec=timeout_sec)

    async def load_model(self, install_ref: str, timeout_sec: int) -> None:
        await self.generate_structured(
            install_ref=install_ref,
            system_prompt="Return compact JSON.",
            user_prompt='Respond exactly as {"status":"ready"}.',
            schema={
                "type": "object",
                "properties": {"status": {"type": "string"}},
                "required": ["status"],
                "additionalProperties": False,
            },
            timeout_sec=timeout_sec,
        )

    async def unload_model(self, install_ref: str, timeout_sec: int) -> None:
        payload = {
            "model": install_ref,
            "messages": [
                {"role": "system", "content": "Return compact JSON."},
                {"role": "user", "content": 'Respond exactly as {"status":"unloaded"}.'},
            ],
            "format": {
                "type": "object",
                "properties": {"status": {"type": "string"}},
                "required": ["status"],
                "additionalProperties": False,
            },
            "stream": False,
            "keep_alive": 0,
        }
        await self._post_json("/api/chat", payload, timeout_sec=timeout_sec)

    async def generate_structured(
        self,
        install_ref: str,
        system_prompt: str,
        user_prompt: str,
        schema: dict[str, Any],
        timeout_sec: int,
    ) -> str:
        payload = {
            "model": install_ref,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "format": schema,
            "stream": False,
            "keep_alive": "15m",
        }
        response = await self._post_json("/api/chat", payload, timeout_sec=timeout_sec)
        try:
            message = response["message"]
            content = message["content"]
        except (KeyError, TypeError) as error:
            raise ServiceError(status_code=502, detail="Ollama returned an unexpected response shape.") from error
        if not isinstance(content, str):
            raise ServiceError(status_code=502, detail="Ollama response content is not a string.")
        return content

    @staticmethod
    def _parse_table_first_column(stdout: str) -> set[str]:
        models: set[str] = set()
        for index, raw_line in enumerate(stdout.splitlines()):
            line = raw_line.strip()
            if not line:
                continue
            if index == 0 and line.upper().startswith("NAME"):
                continue
            models.add(line.split()[0])
        return models

    @staticmethod
    def _clean_error(message: str) -> str:
        return " ".join(message.split()).strip() or "Unknown runtime error."

    def _resolve_ollama_executable(self) -> str | None:
        executable = shutil.which("ollama")
        if executable:
            return executable
        if platform.system().lower() == "darwin" and OLLAMA_MACOS_CLI_PATH.exists():
            return str(OLLAMA_MACOS_CLI_PATH)
        return None

    def _require_executable(self) -> str:
        executable = self._resolve_ollama_executable()
        if executable is None:
            raise ServiceError(
                status_code=503,
                detail="Ollama CLI is not available yet. Install or launch Ollama and retry.",
            )
        return executable

    async def _start_macos_app(self, timeout_sec: int) -> None:
        if not OLLAMA_MACOS_APP_PATH.exists():
            raise ServiceError(
                status_code=502,
                detail=(
                    "Ollama installer finished without creating /Applications/Ollama.app. "
                    "Install Ollama manually from https://ollama.com/download/mac and retry."
                ),
            )

        result = await self._run_exec(
            ["open", str(OLLAMA_MACOS_APP_PATH)],
            timeout_sec=30,
            check=False,
        )
        if result.returncode != 0:
            raise ServiceError(
                status_code=502,
                detail=(
                    "Ollama was downloaded but could not be launched automatically. "
                    "Open /Applications/Ollama.app once, then retry model installation."
                ),
            )

        loop = asyncio.get_running_loop()
        started_at = loop.time()
        while loop.time() - started_at < timeout_sec:
            if self._resolve_ollama_executable() is not None:
                return
            await asyncio.sleep(1)

        raise ServiceError(
            status_code=504,
            detail=(
                "Ollama.app was opened but the CLI did not become available in time. "
                "Launch Ollama once from /Applications and retry."
            ),
        )

    async def _run_exec(
        self,
        args: list[str],
        timeout_sec: int,
        check: bool = True,
    ) -> RuntimeCommandResult:
        process = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout_sec)
        except asyncio.TimeoutError as error:
            process.kill()
            await process.wait()
            raise ServiceError(
                status_code=504,
                detail=f"Runtime command timed out after {timeout_sec} seconds: {' '.join(args)}",
            ) from error

        result = RuntimeCommandResult(
            returncode=process.returncode,
            stdout=stdout.decode("utf-8", errors="replace"),
            stderr=stderr.decode("utf-8", errors="replace"),
        )
        if check and result.returncode != 0:
            raise ServiceError(
                status_code=502,
                detail=self._clean_error(result.stderr or result.stdout),
            )
        return result

    async def _run_shell(
        self,
        command: str,
        timeout_sec: int,
        check: bool = True,
    ) -> RuntimeCommandResult:
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout_sec)
        except asyncio.TimeoutError as error:
            process.kill()
            await process.wait()
            raise ServiceError(
                status_code=504,
                detail=f"Runtime command timed out after {timeout_sec} seconds.",
            ) from error

        result = RuntimeCommandResult(
            returncode=process.returncode,
            stdout=stdout.decode("utf-8", errors="replace"),
            stderr=stderr.decode("utf-8", errors="replace"),
        )
        if check and result.returncode != 0:
            raise ServiceError(
                status_code=502,
                detail=self._clean_error(result.stderr or result.stdout),
            )
        return result

    async def _post_json(self, path: str, payload: dict[str, Any], timeout_sec: int) -> dict[str, Any]:
        request = urllib.request.Request(
            f"{OLLAMA_API_URL}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        def _request() -> dict[str, Any]:
            try:
                with urllib.request.urlopen(request, timeout=timeout_sec) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                body = error.read().decode("utf-8", errors="replace")
                raise ServiceError(
                    status_code=502,
                    detail=f"Ollama request failed: {self._clean_error(body or str(error))}",
                ) from error
            except urllib.error.URLError as error:
                raise ServiceError(
                    status_code=503,
                    detail=(
                        "Ollama runtime is installed but not reachable on http://127.0.0.1:11434. "
                        "Start the Ollama app or daemon and retry."
                    ),
                ) from error
            except json.JSONDecodeError as error:
                raise ServiceError(status_code=502, detail="Ollama returned invalid JSON.") from error

        return await asyncio.to_thread(_request)

    def _start_post_json_stream(
        self,
        path: str,
        payload: dict[str, Any],
        timeout_sec: int,
        progress_callback: Callable[[RuntimePullProgress], None] | None = None,
    ) -> RuntimePullOperation:
        request = urllib.request.Request(
            f"{OLLAMA_API_URL}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        cancel_event = threading.Event()
        response_holder: dict[str, Any] = {}

        def _request() -> None:
            try:
                with urllib.request.urlopen(request, timeout=timeout_sec) as response:
                    response_holder["response"] = response
                    for raw_line in response:
                        if cancel_event.is_set():
                            raise RuntimePullCancelledError()
                        line = raw_line.decode("utf-8", errors="replace").strip()
                        if not line:
                            continue
                        try:
                            item = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if progress_callback is not None and isinstance(item, dict):
                            progress_callback(
                                RuntimePullProgress(
                                    status=str(item.get("status", "")),
                                    completed=item.get("completed") if isinstance(item.get("completed"), int) else None,
                                    total=item.get("total") if isinstance(item.get("total"), int) else None,
                                )
                            )
                    if cancel_event.is_set():
                        raise RuntimePullCancelledError()
            except RuntimePullCancelledError:
                raise
            except urllib.error.HTTPError as error:
                body = error.read().decode("utf-8", errors="replace")
                raise ServiceError(
                    status_code=502,
                    detail=f"Ollama request failed: {self._clean_error(body or str(error))}",
                ) from error
            except urllib.error.URLError as error:
                raise ServiceError(
                    status_code=503,
                    detail=(
                        "Ollama runtime is installed but not reachable on http://127.0.0.1:11434. "
                        "Start the Ollama app or daemon and retry."
                    ),
                ) from error

        async def _runner() -> None:
            await asyncio.to_thread(_request)

        def _cancel() -> None:
            cancel_event.set()
            response = response_holder.get("response")
            if response is not None:
                with contextlib.suppress(Exception):
                    response.close()

        return RuntimePullOperation(task=asyncio.create_task(_runner()), cancel_callback=_cancel)


def build_ai_runtime_client() -> AIRuntimeClient:
    settings = get_settings()
    if settings.ai_runtime == "ollama":
        return OllamaRuntimeClient()
    raise ServiceError(status_code=500, detail=f"Unsupported AI runtime '{settings.ai_runtime}'.")
