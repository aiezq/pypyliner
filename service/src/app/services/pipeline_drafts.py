from __future__ import annotations

import json
import re
from collections import OrderedDict
from dataclasses import dataclass

from pydantic import ValidationError

from src.app.core.settings import get_settings
from src.app.schemas.ai import GeneratePipelineDraftRequest, GeneratePipelineDraftResponse, PipelineDraft
from src.app.services.ai_models import AIModelManager
from src.app.services.ai_runtime import AIRuntimeClient
from src.app.services.command_packs import CommandPackManager
from src.app.services.runtime import ServiceError

_SECRET_LITERAL_RE = re.compile(
    r"""(?ix)
    (
        (password|passwd|token|secret|api[_-]?key)
        \s*[:=]\s*
        [^\s"']{4,}
    )
    """
)

RISK_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("sudo", re.compile(r"(^|\s)sudo(\s|$)", re.IGNORECASE)),
    ("rm", re.compile(r"(^|\s)rm(\s|$)", re.IGNORECASE)),
    ("dd", re.compile(r"(^|\s)dd(\s|$)", re.IGNORECASE)),
    ("mkfs", re.compile(r"(^|\s)mkfs(\.[a-z0-9_-]+)?(\s|$)", re.IGNORECASE)),
    ("systemctl", re.compile(r"(^|\s)systemctl(\s|$)", re.IGNORECASE)),
    ("iptables", re.compile(r"(^|\s)iptables(\s|$)", re.IGNORECASE)),
    ("curl_pipe_sh", re.compile(r"curl\b[^|]*\|\s*(sh|bash)\b", re.IGNORECASE)),
    ("write_etc", re.compile(r"(/etc/|>\s*/etc/|\btee\s+/etc/)", re.IGNORECASE)),
    ("write_usr", re.compile(r"(/usr/|>\s*/usr/|\btee\s+/usr/)", re.IGNORECASE)),
    ("write_var_lib", re.compile(r"(/var/lib/|>\s*/var/lib/|\btee\s+/var/lib/)", re.IGNORECASE)),
)


@dataclass(slots=True)
class CommandRisk:
    code: str
    message: str


def classify_command_risks(command: str) -> list[CommandRisk]:
    risks: list[CommandRisk] = []
    for code, pattern in RISK_PATTERNS:
        if pattern.search(command):
            risks.append(CommandRisk(code=code, message=f"Risk: {code} detected in command '{command.strip()}'."))
    return risks


class PipelineDraftGenerator:
    def __init__(
        self,
        model_manager: AIModelManager,
        runtime_client: AIRuntimeClient,
        command_pack_manager: CommandPackManager,
    ) -> None:
        self._settings = get_settings()
        self._models = model_manager
        self._runtime = runtime_client
        self._command_packs = command_pack_manager

    async def generate(self, payload: GeneratePipelineDraftRequest) -> GeneratePipelineDraftResponse:
        if not self._settings.ai_enabled:
            raise ServiceError(status_code=404, detail="Local AI is disabled in settings.")
        if len(payload.documentation_text) > self._settings.ai_max_doc_chars:
            raise ServiceError(
                status_code=413,
                detail=f"Documentation is too large. Limit is {self._settings.ai_max_doc_chars} characters.",
            )

        status = await self._models.get_model_status(payload.model_id)
        if status.model.model_state != "ready":
            raise ServiceError(
                status_code=409,
                detail=f"Model '{payload.model_id}' is not ready. Current state: {status.model.model_state}.",
            )

        manifest = self._models.get_manifest_entry(payload.model_id)
        command_pack_context = self._build_command_pack_context(payload.context.command_packs)
        system_prompt = self._build_system_prompt()
        initial_prompt = self._build_user_prompt(payload.documentation_text, command_pack_context)
        draft = await self._generate_valid_draft(
            install_ref=manifest.install_ref,
            system_prompt=system_prompt,
            prompt=initial_prompt,
        )
        normalized = self._normalize_draft(draft)
        warnings = self._merge_warnings(normalized)
        return GeneratePipelineDraftResponse(
            draft=normalized,
            warnings=warnings,
            install_state=status.model.install_state,
            model_state=status.model.model_state,
        )

    async def _generate_valid_draft(
        self,
        install_ref: str,
        system_prompt: str,
        prompt: str,
    ) -> PipelineDraft:
        schema = PipelineDraft.model_json_schema()
        response_text = await self._runtime.generate_structured(
            install_ref=install_ref,
            system_prompt=system_prompt,
            user_prompt=prompt,
            schema=schema,
            timeout_sec=self._settings.ai_request_timeout_sec,
        )

        for attempt in range(3):
            try:
                payload = json.loads(response_text)
                return PipelineDraft.model_validate(payload)
            except (json.JSONDecodeError, ValidationError) as error:
                if attempt >= 2:
                    raise ServiceError(
                        status_code=422,
                        detail=f"Model returned invalid PipelineDraft JSON after repair attempts: {error}",
                    ) from error
                response_text = await self._runtime.generate_structured(
                    install_ref=install_ref,
                    system_prompt=system_prompt,
                    user_prompt=self._build_repair_prompt(response_text, str(error)),
                    schema=schema,
                    timeout_sec=self._settings.ai_request_timeout_sec,
                )

        raise ServiceError(status_code=500, detail="Unexpected draft generation failure.")

    @staticmethod
    def _build_system_prompt() -> str:
        return (
            "You build only safe operator pipeline drafts. "
            "Return JSON only that matches the provided PipelineDraft schema. "
            "Prefer existing command templates when they fit. "
            "Do not add destructive commands without explicit support in the documentation. "
            "If the documentation is incomplete, add assumptions and warnings instead of inventing facts. "
            "Use variables instead of literal hosts, tokens, passwords, or environment-specific paths. "
            "Secrets are forbidden as command literals."
        )

    def _build_command_pack_context(self, enabled: bool) -> str:
        if not enabled:
            return "Command template context disabled."

        templates = self._command_packs.list_command_packs()["templates"]
        if not templates:
            return "No command templates available."
        lines = [
            f'- {item["id"]}: name="{item["name"]}", command="{item["command"]}", description="{item["description"]}"'
            for item in templates
        ]
        return "\n".join(lines)

    @staticmethod
    def _build_user_prompt(documentation_text: str, command_pack_context: str) -> str:
        return (
            "Build a graph-oriented operator pipeline draft.\n"
            "Available command templates:\n"
            f"{command_pack_context}\n\n"
            "Documentation:\n"
            f"{documentation_text}"
        )

    @staticmethod
    def _build_repair_prompt(previous_output: str, error_message: str) -> str:
        return (
            "The previous response was invalid. Repair it and return JSON only.\n"
            f"Validation error:\n{error_message}\n\n"
            "Previous response:\n"
            f"{previous_output}"
        )

    def _normalize_draft(self, draft: PipelineDraft) -> PipelineDraft:
        variable_names = {variable.name for variable in draft.variables}
        template_map = {
            item["command"]: item["id"]
            for item in self._command_packs.list_command_packs()["templates"]
        }

        normalized_steps = []
        collected_warnings: list[str] = list(draft.warnings)
        for step in draft.steps:
            uses_variables = list(OrderedDict.fromkeys(item.strip() for item in step.uses_variables if item.strip()))
            template_id = step.template_id or template_map.get(step.command.strip())
            normalized_steps.append(
                step.model_copy(
                    update={
                        "label": step.label.strip(),
                        "command": step.command.strip(),
                        "description": step.description.strip(),
                        "uses_variables": uses_variables,
                        "template_id": template_id,
                    }
                )
            )

            for risk in classify_command_risks(step.command):
                collected_warnings.append(risk.message)

            if _SECRET_LITERAL_RE.search(step.command):
                collected_warnings.append(
                    f"Risk: secret_literal detected in command '{step.command.strip()}'. Use variables instead."
                )

            missing_variables = [name for name in uses_variables if name not in variable_names]
            if missing_variables:
                collected_warnings.append(
                    f"Step '{step.label.strip()}' references undeclared variables: {', '.join(missing_variables)}."
                )

        assumptions = self._dedupe_strings([item.strip() for item in draft.assumptions if item.strip()])
        warnings = self._dedupe_strings(collected_warnings)

        return draft.model_copy(
            update={
                "flow_name": draft.flow_name.strip() or "Generated Pipeline",
                "summary": draft.summary.strip(),
                "assumptions": assumptions,
                "warnings": warnings,
                "steps": normalized_steps,
            }
        )

    @staticmethod
    def _merge_warnings(draft: PipelineDraft) -> list[str]:
        return PipelineDraftGenerator._dedupe_strings(draft.warnings)

    @staticmethod
    def _dedupe_strings(items: list[str]) -> list[str]:
        return list(OrderedDict.fromkeys(item for item in items if item))

