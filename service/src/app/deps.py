from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

from starlette.requests import HTTPConnection

from src.app.services.ai_models import AIModelManager
from src.app.services.ai_runtime import build_ai_runtime_client
from src.app.services.command_packs import CommandPackManager
from src.app.services.history_db import HistoryDatabase
from src.app.services.pipeline_drafts import PipelineDraftGenerator
from src.app.services.pipeline_flows import PipelineFlowManager
from src.app.services.runtime import RuntimeManager
from src.app.services.terminal_runtime import TerminalRuntimeManager


@dataclass(slots=True)
class ApplicationServices:
    history_database: HistoryDatabase
    runtime_manager: RuntimeManager
    terminal_runtime_manager: TerminalRuntimeManager
    command_pack_manager: CommandPackManager
    pipeline_flow_manager: PipelineFlowManager
    ai_runtime_client: Any
    ai_model_manager: AIModelManager
    pipeline_draft_generator: PipelineDraftGenerator


def build_application_services() -> ApplicationServices:
    history_database = HistoryDatabase()
    runtime_manager = RuntimeManager(history_db=history_database)
    terminal_runtime_manager = TerminalRuntimeManager(events=runtime_manager.events)
    command_pack_manager = CommandPackManager()
    pipeline_flow_manager = PipelineFlowManager()
    ai_runtime_client = build_ai_runtime_client()
    ai_model_manager = AIModelManager(runtime_client=ai_runtime_client)
    pipeline_draft_generator = PipelineDraftGenerator(
        model_manager=ai_model_manager,
        runtime_client=ai_runtime_client,
        command_pack_manager=command_pack_manager,
    )
    return ApplicationServices(
        history_database=history_database,
        runtime_manager=runtime_manager,
        terminal_runtime_manager=terminal_runtime_manager,
        command_pack_manager=command_pack_manager,
        pipeline_flow_manager=pipeline_flow_manager,
        ai_runtime_client=ai_runtime_client,
        ai_model_manager=ai_model_manager,
        pipeline_draft_generator=pipeline_draft_generator,
    )


def get_application_services(connection: HTTPConnection) -> ApplicationServices:
    services = getattr(connection.app.state, "services", None)
    if services is None:
        raise RuntimeError("Application services are not initialized")
    return services


def _get_service(connection: HTTPConnection, attribute_name: str) -> Any:
    return getattr(get_application_services(connection), attribute_name)


def get_runtime(connection: HTTPConnection) -> RuntimeManager:
    return cast(RuntimeManager, _get_service(connection, "runtime_manager"))


def get_terminal_runtime(connection: HTTPConnection) -> TerminalRuntimeManager:
    return cast(TerminalRuntimeManager, _get_service(connection, "terminal_runtime_manager"))


def get_command_pack_manager(connection: HTTPConnection) -> CommandPackManager:
    return cast(CommandPackManager, _get_service(connection, "command_pack_manager"))


def get_history_database(connection: HTTPConnection) -> HistoryDatabase:
    return cast(HistoryDatabase, _get_service(connection, "history_database"))


def get_pipeline_flow_manager(connection: HTTPConnection) -> PipelineFlowManager:
    return cast(PipelineFlowManager, _get_service(connection, "pipeline_flow_manager"))


def get_ai_model_manager(connection: HTTPConnection) -> AIModelManager:
    return cast(AIModelManager, _get_service(connection, "ai_model_manager"))


def get_pipeline_draft_generator(connection: HTTPConnection) -> PipelineDraftGenerator:
    return cast(PipelineDraftGenerator, _get_service(connection, "pipeline_draft_generator"))
