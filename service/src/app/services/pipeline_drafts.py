from __future__ import annotations

import json
import re
from collections import OrderedDict
from dataclasses import dataclass
from typing import TypeVar

from pydantic import BaseModel, Field, ValidationError

from src.app.core.settings import get_settings
from src.app.schemas.ai import (
    AIModelStatusResponse,
    AnalyzeDocumentationRequest,
    AnalyzeDocumentationResponse,
    DocumentationClarificationAnswer,
    DocumentationClarificationQuestion,
    GeneratePipelineDraftRequest,
    GeneratePipelineDraftResponse,
    PipelineDraft,
    PipelineDraftStep,
)
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


class DocumentationClarificationSet(BaseModel):
    questions: list[DocumentationClarificationQuestion] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


SchemaModelT = TypeVar("SchemaModelT", bound=BaseModel)


def classify_command_risks(command: str) -> list[CommandRisk]:
    risks: list[CommandRisk] = []
    for code, pattern in RISK_PATTERNS:
        if pattern.search(command):
            risks.append(CommandRisk(code=code, message=f"Risk: {code} detected in command '{command.strip()}'."))
    return risks


def extract_explicit_shell_commands(documentation_text: str) -> list[str]:
    lines = [line.rstrip() for line in documentation_text.splitlines()]
    commands: list[str] = []
    current_parts: list[str] = []
    continuation_open = False

    def append_command(command: str) -> None:
        normalized = " ".join(command.split()).strip()
        if normalized and normalized not in commands:
            commands.append(normalized)

    index = 0
    while index < len(lines):
        raw_line = lines[index]
        stripped = raw_line.strip()
        lower_line = stripped.lower()
        if not stripped:
            index += 1
            continue

        if "download_physical_ai_code.sh" in lower_line:
            append_command(stripped)
            index += 1
            continue

        if "run_with_robo_app.sh" in lower_line:
            append_command(stripped)
            index += 1
            continue

        if "./ruka docker -i " in lower_line or " ./ruka docker -i " in lower_line:
            append_command(stripped)
            index += 1
            continue

        if stripped.startswith("./ruka skill collect"):
            collect_parts = [stripped.removesuffix("\\").strip()]
            probe_index = index + 1
            while probe_index < len(lines):
                probe_line = lines[probe_index]
                probe_stripped = probe_line.strip()
                if not probe_stripped:
                    break
                if probe_stripped.startswith("-"):
                    collect_parts.append(probe_stripped.removesuffix("\\").strip())
                    probe_index += 1
                    continue
                break

            append_command(" ".join(collect_parts))
            index = probe_index
            continue

        index += 1

    def is_command_start(value: str) -> bool:
        stripped = value.strip()
        return (
            stripped.startswith("./")
            or stripped.startswith("$HOME/")
            or stripped.startswith("~/")
            or stripped.startswith("/")
            or stripped.startswith("download_")
            or stripped.startswith("cd ")
            or stripped.startswith("python ")
            or stripped.startswith("bash ")
            or stripped.startswith("sh ")
            or stripped.startswith("git ")
            or stripped.startswith("docker ")
        )

    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped:
            if current_parts:
                append_command(" ".join(current_parts))
                current_parts = []
                continuation_open = False
            continue

        if current_parts:
            is_continuation = (
                continuation_open
                or stripped.startswith("--")
                or raw_line.startswith(" ")
                or raw_line.startswith("\t")
            )
            if is_continuation:
                current_parts.append(stripped.removesuffix("\\").strip())
                continuation_open = stripped.endswith("\\")
                continue

            append_command(" ".join(current_parts))
            current_parts = []
            continuation_open = False

        if is_command_start(stripped):
            current_parts = [stripped.removesuffix("\\").strip()]
            continuation_open = stripped.endswith("\\")
            if stripped.endswith("\\"):
                continue
            append_command(" ".join(current_parts))
            current_parts = []
            continuation_open = False

    if current_parts:
        append_command(" ".join(current_parts))

    return commands


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

    async def analyze_documentation(
        self,
        payload: AnalyzeDocumentationRequest,
    ) -> AnalyzeDocumentationResponse:
        status, install_ref, command_pack_context = await self._prepare_generation(payload)
        explicit_commands = extract_explicit_shell_commands(payload.documentation_text)
        clarification_set = await self._generate_valid_response(
            install_ref=install_ref,
            system_prompt=self._build_clarification_system_prompt(),
            prompt=self._build_clarification_prompt(
                documentation_text=payload.documentation_text,
                command_pack_context=command_pack_context,
                explicit_commands=explicit_commands,
            ),
            schema_model=DocumentationClarificationSet,
        )
        normalized = self._normalize_clarification_set(
            clarification_set,
            documentation_text=payload.documentation_text,
            explicit_commands=explicit_commands,
        )
        return AnalyzeDocumentationResponse(
            questions=normalized.questions,
            warnings=normalized.warnings,
            install_state=status.model.install_state,
            model_state=status.model.model_state,
        )

    async def generate(self, payload: GeneratePipelineDraftRequest) -> GeneratePipelineDraftResponse:
        status, install_ref, command_pack_context = await self._prepare_generation(payload)
        clarification_answers = self._serialize_clarification_answers(payload.clarification_answers)
        explicit_commands = extract_explicit_shell_commands(payload.documentation_text)
        draft = await self._generate_valid_response(
            install_ref=install_ref,
            system_prompt=self._build_generation_system_prompt(),
            prompt=self._build_generation_prompt(
                documentation_text=payload.documentation_text,
                command_pack_context=command_pack_context,
                clarification_answers=clarification_answers,
                explicit_commands=explicit_commands,
            ),
            schema_model=PipelineDraft,
        )
        normalized = self._normalize_draft(
            draft,
            documentation_text=payload.documentation_text,
            clarification_answers=payload.clarification_answers,
            explicit_commands=explicit_commands,
        )
        warnings = self._merge_warnings(normalized)
        return GeneratePipelineDraftResponse(
            draft=normalized,
            warnings=warnings,
            install_state=status.model.install_state,
            model_state=status.model.model_state,
        )

    async def _prepare_generation(
        self,
        payload: AnalyzeDocumentationRequest,
    ) -> tuple[AIModelStatusResponse, str, str]:
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
        return status, manifest.install_ref, command_pack_context

    async def _generate_valid_response(
        self,
        install_ref: str,
        system_prompt: str,
        prompt: str,
        schema_model: type[SchemaModelT],
    ) -> SchemaModelT:
        schema = schema_model.model_json_schema()
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
                return schema_model.model_validate(payload)
            except (json.JSONDecodeError, ValidationError) as error:
                if attempt >= 2:
                    raise ServiceError(
                        status_code=422,
                        detail=f"Model returned invalid JSON after repair attempts: {error}",
                    ) from error
                response_text = await self._runtime.generate_structured(
                    install_ref=install_ref,
                    system_prompt=system_prompt,
                    user_prompt=self._build_repair_prompt(response_text, str(error)),
                    schema=schema,
                    timeout_sec=self._settings.ai_request_timeout_sec,
                )

        raise ServiceError(status_code=500, detail="Unexpected AI generation failure.")

    @staticmethod
    def _build_clarification_system_prompt() -> str:
        return (
            "You analyze operator documentation before pipeline generation. "
            "Return JSON only that matches the provided schema. "
            "Your job is to find the minimum missing operator choices required to build the final command draft safely. "
            "Ask only essential questions, not generic ones. "
            "Prioritize placeholders, environment variants, region-specific branches, prod/test switches, item set selectors, box/set identifiers, operator login, and headset app IP. "
            "If the SOP contains multiple stages such as code fetch, teleop, docker creation, and collect, ask which stages should be included. "
            "If the documentation already contains a value, do not ask for it again. "
            "Use answer_type='choice' when the documentation explicitly gives options such as Moscow/Belgrade or test/prod."
        )

    @staticmethod
    def _build_generation_system_prompt() -> str:
        return (
            "You build only safe operator pipeline drafts from SOP-style documentation. "
            "Return JSON only that matches the provided PipelineDraft schema. "
            "Use the clarification answers as authoritative operator input. "
            "Do not invent missing values. If a required value is still unknown, keep it as a variable and explain it in assumptions or warnings. "
            "Prefer existing command templates when they fit. "
            "Preserve command fragments and flag structure from the documentation when they are explicit. "
            "If the documentation contains explicit shell commands, the final draft must cover them unless the clarification answers explicitly exclude a branch or stage. "
            "Do not add synthetic steps such as opening a terminal. The terminal node is already created by the UI outside the draft steps. "
            "When teleop must stay running while docker or collect commands execute separately, assign those steps to different terminal_group values. "
            "Use variables instead of literal hosts, secrets, operator logins, item set ids, box ids, and headset IP addresses. "
            "Secrets are forbidden as command literals. "
            "If documentation contains conditional branches, choose the branch indicated by the clarification answers."
        )

    def _build_command_pack_context(self, enabled: bool) -> str:
        if not enabled:
            return "Command template context disabled."

        templates = [
            item
            for item in self._command_packs.list_command_packs()["templates"]
            if item["command"] != "operator:create_terminal"
        ]
        if not templates:
            return "No command templates available."
        lines = [
            f'- {item["id"]}: name="{item["name"]}", command="{item["command"]}", description="{item["description"]}"'
            for item in templates
        ]
        return "\n".join(lines)

    @staticmethod
    def _build_clarification_prompt(
        documentation_text: str,
        command_pack_context: str,
        explicit_commands: list[str],
    ) -> str:
        commands_block = "\n".join(f"- {command}" for command in explicit_commands) or "No explicit shell commands detected."
        return (
            "Analyze this operator documentation before generating commands.\n"
            "Return only the essential clarification questions.\n\n"
            "Known important examples of clarification targets:\n"
            '- region: "Moscow" or "Belgrade"\n'
            '- run mode: "test" or "prod"\n'
            '- workflow scope: "full_workflow", "teleop_only", "docker_only", or "collect_only" when the SOP contains multiple stages\n'
            "- item box / set number\n"
            "- operator login\n"
            "- headset app IP\n"
            "- any robot / arm / environment switch that changes the command path\n\n"
            "Available command templates:\n"
            f"{command_pack_context}\n\n"
            "Explicit shell commands detected in the documentation:\n"
            f"{commands_block}\n\n"
            "Documentation:\n"
            f"{documentation_text}"
        )

    @staticmethod
    def _build_generation_prompt(
        documentation_text: str,
        command_pack_context: str,
        clarification_answers: list[dict[str, str]],
        explicit_commands: list[str],
    ) -> str:
        answers_block = (
            "\n".join(f'- {item["question_id"]}: {item["answer"]}' for item in clarification_answers)
            if clarification_answers
            else "No clarification answers provided."
        )
        commands_block = "\n".join(f"- {command}" for command in explicit_commands) or "No explicit shell commands detected."
        return (
            "Build a graph-oriented operator pipeline draft from the documentation.\n"
            "Important: the operator may have answered clarification questions. Use those answers to select the correct branch and command variants.\n\n"
            "Available command templates:\n"
            f"{command_pack_context}\n\n"
            "Clarification answers:\n"
            f"{answers_block}\n\n"
            "Explicit shell commands detected in the documentation:\n"
            f"{commands_block}\n\n"
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

    def _normalize_clarification_set(
        self,
        clarification_set: DocumentationClarificationSet,
        documentation_text: str,
        explicit_commands: list[str],
    ) -> DocumentationClarificationSet:
        heuristic_questions = self._build_heuristic_questions(documentation_text, explicit_commands)
        normalized_questions: list[DocumentationClarificationQuestion] = []
        seen_ids: set[str] = set()
        for index, question in enumerate([*heuristic_questions, *clarification_set.questions], start=1):
            question_id = question.id.strip() or f"question_{index}"
            if question_id in seen_ids:
                continue
            seen_ids.add(question_id)

            choices = list(OrderedDict.fromkeys(item.strip() for item in question.choices if item.strip()))
            answer_type = "choice" if choices else "text"
            normalized_questions.append(
                question.model_copy(
                    update={
                        "id": question_id,
                        "question": question.question.strip(),
                        "description": question.description.strip(),
                        "choices": choices,
                        "answer_type": answer_type,
                    }
                )
            )

        warnings = self._dedupe_strings(
            [
                *[item.strip() for item in clarification_set.warnings if item.strip()],
                *self._heuristic_clarification_warnings(documentation_text, explicit_commands),
            ]
        )
        return DocumentationClarificationSet(questions=normalized_questions, warnings=warnings)

    def _normalize_draft(
        self,
        draft: PipelineDraft,
        documentation_text: str,
        clarification_answers: list[DocumentationClarificationAnswer],
        explicit_commands: list[str],
    ) -> PipelineDraft:
        variable_names = {variable.name for variable in draft.variables}
        template_by_command = {
            item["command"]: item["id"]
            for item in self._command_packs.list_command_packs()["templates"]
        }
        template_by_id = {
            item["id"]: item["command"]
            for item in self._command_packs.list_command_packs()["templates"]
        }
        answer_map = {
            item.question_id.strip(): item.answer.strip()
            for item in clarification_answers
            if item.question_id.strip() and item.answer.strip()
        }

        normalized_steps = []
        collected_warnings: list[str] = list(draft.warnings)
        for step in draft.steps:
            uses_variables = list(OrderedDict.fromkeys(item.strip() for item in step.uses_variables if item.strip()))
            resolved_command = step.command.strip()
            template_id = step.template_id or template_by_command.get(resolved_command)
            if resolved_command in template_by_id:
                template_id = resolved_command
                resolved_command = template_by_id[resolved_command]
            if resolved_command == "operator:create_terminal":
                collected_warnings.append(
                    f"Dropped synthetic step '{step.label.strip()}' because terminal creation is handled by the graph UI."
                )
                continue
            normalized_steps.append(
                step.model_copy(
                    update={
                        "label": step.label.strip(),
                        "command": resolved_command,
                        "description": step.description.strip(),
                        "uses_variables": uses_variables,
                        "template_id": template_id,
                        "terminal_group": step.terminal_group.strip()
                        if isinstance(step.terminal_group, str) and step.terminal_group.strip()
                        else None,
                    }
                )
            )

            for risk in classify_command_risks(resolved_command):
                collected_warnings.append(risk.message)

            if _SECRET_LITERAL_RE.search(resolved_command):
                collected_warnings.append(
                    f"Risk: secret_literal detected in command '{resolved_command}'. Use variables instead."
                )

            missing_variables = [name for name in uses_variables if name not in variable_names]
            if missing_variables:
                collected_warnings.append(
                    f"Step '{step.label.strip()}' references undeclared variables: {', '.join(missing_variables)}."
                )

        normalized_steps = self._merge_explicit_commands_into_steps(
            steps=normalized_steps,
            documentation_text=documentation_text,
            explicit_commands=explicit_commands,
            clarification_answers=answer_map,
            warnings=collected_warnings,
        )
        normalized_steps = self._assign_terminal_groups(normalized_steps)

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
    def _serialize_clarification_answers(
        answers: list[DocumentationClarificationAnswer],
    ) -> list[dict[str, str]]:
        return [
            {
                "question_id": item.question_id.strip(),
                "answer": item.answer.strip(),
            }
            for item in answers
            if item.question_id.strip() and item.answer.strip()
        ]

    @staticmethod
    def _dedupe_strings(items: list[str]) -> list[str]:
        return list(OrderedDict.fromkeys(item for item in items if item))

    @staticmethod
    def _build_heuristic_questions(
        documentation_text: str,
        explicit_commands: list[str],
    ) -> list[DocumentationClarificationQuestion]:
        lower_text = documentation_text.lower()
        questions: list[DocumentationClarificationQuestion] = []

        has_teleop = any("run_with_robo_app.sh" in command.lower() for command in explicit_commands)
        has_docker = any("./ruka docker" in command.lower() or " docker -i " in command.lower() for command in explicit_commands)
        has_collect = any("./ruka skill collect" in command.lower() for command in explicit_commands)
        if sum([has_teleop, has_docker, has_collect]) >= 2:
            choices = ["full_workflow"]
            if has_teleop:
                choices.append("teleop_only")
            if has_docker:
                choices.append("docker_only")
            if has_collect:
                choices.append("collect_only")
            questions.append(
                DocumentationClarificationQuestion(
                    id="workflow_scope",
                    question="Which stages should be included in the final pipeline?",
                    description="Choose whether the graph should cover the full SOP or only teleop, docker, or collect.",
                    answer_type="choice",
                    choices=choices,
                    required=True,
                )
            )

        if "moscow" in lower_text and "belgrade" in lower_text:
            questions.append(
                DocumentationClarificationQuestion(
                    id="region",
                    question="Which region branch should be used?",
                    description="The documentation contains different command paths for Moscow and Belgrade.",
                    answer_type="choice",
                    choices=["Moscow", "Belgrade"],
                    required=True,
                )
            )

        if "test" in lower_text and "prod" in lower_text:
            questions.append(
                DocumentationClarificationQuestion(
                    id="run_mode",
                    question="Should the collect command use test or prod mode?",
                    description="The documentation contains both test and prod collect variants.",
                    answer_type="choice",
                    choices=["test", "prod"],
                    required=True,
                )
            )

        if "snacks_box_x_set_x" in lower_text:
            questions.append(
                DocumentationClarificationQuestion(
                    id="box_number",
                    question="Which box number should replace x in lobach/snacks_box_x_set_x?",
                    description="Needed to build the final Moscow dfs-items-path.",
                    answer_type="text",
                    required=True,
                )
            )
            questions.append(
                DocumentationClarificationQuestion(
                    id="set_number",
                    question="Which item set number should replace x in lobach/snacks_box_x_set_x?",
                    description="Needed to build the final Moscow dfs-items-path.",
                    answer_type="text",
                    required=True,
                )
            )
        elif "set_x" in lower_text or "set №" in lower_text or "set #" in lower_text:
            questions.append(
                DocumentationClarificationQuestion(
                    id="set_number",
                    question="Which item set number should be used?",
                    description="Needed to replace the set placeholder in the final dfs-items-path.",
                    answer_type="text",
                    required=True,
                )
            )

        if "<your staff login here>" in lower_text:
            questions.append(
                DocumentationClarificationQuestion(
                    id="operator_login",
                    question="What operator login should be used for the -o flag?",
                    description="The SOP contains a placeholder for the staff login.",
                    answer_type="text",
                    required=True,
                )
            )

        if "--app xxx.xxx" in lower_text or "ip shown in the headset" in lower_text or "ip-адресом" in lower_text:
            questions.append(
                DocumentationClarificationQuestion(
                    id="app_ip",
                    question="What headset IP should be passed to --app?",
                    description="Use the IP shown in Rekorder Quest or in the headset.",
                    answer_type="text",
                    required=True,
                )
            )

        return questions

    @staticmethod
    def _heuristic_clarification_warnings(
        documentation_text: str,
        explicit_commands: list[str],
    ) -> list[str]:
        warnings: list[str] = []
        lower_text = documentation_text.lower()
        if sum(
            [
                any("run_with_robo_app.sh" in command.lower() for command in explicit_commands),
                any("./ruka docker" in command.lower() for command in explicit_commands),
                any("./ruka skill collect" in command.lower() for command in explicit_commands),
            ]
        ) >= 2:
            warnings.append("Documentation contains multiple operational stages and should not collapse into a single collect command.")
        if "moscow" in lower_text and "belgrade" in lower_text:
            warnings.append("Documentation contains multiple regional branches.")
        if "test" in lower_text and "prod" in lower_text:
            warnings.append("Documentation contains both test and prod collect variants.")
        return warnings

    def _merge_explicit_commands_into_steps(
        self,
        steps: list,
        documentation_text: str,
        explicit_commands: list[str],
        clarification_answers: dict[str, str],
        warnings: list[str],
    ) -> list:
        relevant_commands = self._select_relevant_commands(
            documentation_text=documentation_text,
            explicit_commands=explicit_commands,
            clarification_answers=clarification_answers,
        )
        if not relevant_commands:
            return steps

        used_indices: set[int] = set()
        rebuilt_steps = []
        rebuilt_stage_keys: set[str] = set()
        for index, explicit_command in enumerate(relevant_commands, start=1):
            matched_index = None
            for candidate_index, step in enumerate(steps):
                if candidate_index in used_indices:
                    continue
                if self._commands_match(step.command, explicit_command):
                    matched_index = candidate_index
                    break

            if matched_index is not None:
                used_indices.add(matched_index)
                matched_step = steps[matched_index]
                rebuilt_steps.append(
                    matched_step.model_copy(
                        update={
                            "id": matched_step.id or f"step_{index}",
                            "label": self._derive_step_label(explicit_command),
                            "command": explicit_command,
                        }
                    )
                )
                stage_key = self._command_stage_key(explicit_command)
                if stage_key:
                    rebuilt_stage_keys.add(stage_key)
                continue

            warnings.append(f"Added explicit command from documentation that was missing in model output: {explicit_command}")
            rebuilt_steps.append(
                PipelineDraftStep(
                    id=f"step_{index}",
                    label=self._derive_step_label(explicit_command),
                    command=explicit_command,
                    description="Added from explicit SOP command.",
                    uses_variables=[],
                    template_id=None,
                    terminal_type="local",
                )
            )
            stage_key = self._command_stage_key(explicit_command)
            if stage_key:
                rebuilt_stage_keys.add(stage_key)

        for candidate_index, step in enumerate(steps):
            if candidate_index in used_indices or step.command.strip() == "operator:create_terminal":
                continue

            stage_key = self._command_stage_key(step.command)
            if stage_key and stage_key in rebuilt_stage_keys:
                warnings.append(
                    f"Dropped duplicate stage '{stage_key}' from model output because an explicit SOP command already covers it."
                )
                continue

            rebuilt_steps.append(step)
            if stage_key:
                rebuilt_stage_keys.add(stage_key)

        return rebuilt_steps

    @staticmethod
    def _commands_match(left: str, right: str) -> bool:
        normalized_left = " ".join(left.split())
        normalized_right = " ".join(right.split())
        if normalized_left == normalized_right or normalized_left in normalized_right or normalized_right in normalized_left:
            return True

        left_stage = PipelineDraftGenerator._command_stage_key(normalized_left)
        right_stage = PipelineDraftGenerator._command_stage_key(normalized_right)
        return bool(left_stage and left_stage == right_stage)

    @staticmethod
    def _derive_step_label(command: str) -> str:
        lower_command = command.lower()
        if "download_physical_ai_code.sh" in lower_command:
            return "Obtain Code"
        if "./ruka docker" in lower_command or " docker -i " in lower_command:
            return "Start Docker"
        if "run_with_robo_app.sh" in lower_command:
            return "Start Teleop"
        if "./ruka skill collect" in lower_command:
            return "Collect Snacks"
        return command.split()[0].replace("_", " ").strip().title()

    @staticmethod
    def _command_stage_key(command: str) -> str | None:
        lower_command = command.lower()
        if "download_physical_ai_code.sh" in lower_command:
            return "obtain_code"
        if "run_with_robo_app.sh" in lower_command:
            return "start_teleop"
        if "./ruka docker" in lower_command or " docker -i " in lower_command:
            return "start_docker"
        if "./ruka skill collect" in lower_command:
            return "collect_snacks"
        return None

    def _assign_terminal_groups(self, steps: list[PipelineDraftStep]) -> list[PipelineDraftStep]:
        if not steps:
            return steps

        stage_keys = [self._command_stage_key(step.command) for step in steps]
        has_teleop = "start_teleop" in stage_keys
        has_collect_lane = any(stage_key in {"start_docker", "collect_snacks"} for stage_key in stage_keys)
        requires_split_terminals = has_teleop and has_collect_lane

        normalized_steps: list[PipelineDraftStep] = []
        for step in steps:
            existing_group = step.terminal_group.strip() if isinstance(step.terminal_group, str) and step.terminal_group.strip() else None
            if existing_group:
                normalized_steps.append(step.model_copy(update={"terminal_group": existing_group}))
                continue

            stage_key = self._command_stage_key(step.command)
            terminal_group = "main_terminal"
            if requires_split_terminals:
                if stage_key in {"obtain_code", "start_teleop"}:
                    terminal_group = "teleop_terminal"
                elif stage_key in {"start_docker", "collect_snacks"}:
                    terminal_group = "collect_terminal"

            normalized_steps.append(step.model_copy(update={"terminal_group": terminal_group}))

        return normalized_steps

    @staticmethod
    def _select_relevant_commands(
        documentation_text: str,
        explicit_commands: list[str],
        clarification_answers: dict[str, str],
    ) -> list[str]:
        _ = documentation_text
        lower_answers = {key: value.lower() for key, value in clarification_answers.items()}
        scope = lower_answers.get("workflow_scope", "full_workflow")
        region = lower_answers.get("region", "")
        run_mode = lower_answers.get("run_mode", "")

        selected: list[str] = []
        for command in explicit_commands:
            lower_command = command.lower()

            is_fetch = "download_physical_ai_code.sh" in lower_command
            is_teleop = "run_with_robo_app.sh" in lower_command
            is_docker = "./ruka docker" in lower_command or " docker -i " in lower_command
            is_collect = "./ruka skill collect" in lower_command

            if scope == "teleop_only" and not (is_fetch or is_teleop):
                continue
            if scope == "docker_only" and not (is_fetch or is_docker):
                continue
            if scope == "collect_only" and not is_collect:
                continue

            if is_collect and region:
                if region == "moscow" and "belgrade/" in lower_command:
                    continue
                if region == "belgrade" and "lobach/" in lower_command:
                    continue

            if is_collect and run_mode:
                has_test = "--test" in lower_command
                if run_mode == "test" and not has_test:
                    continue
                if run_mode == "prod" and has_test:
                    continue

            selected.append(command)

        deduped: list[str] = []
        for command in selected:
            if command not in deduped:
                deduped.append(command)
        return deduped
