from src.app.services.ai_models import AIModelManager
from src.app.services.ai_runtime import build_ai_runtime_client
from src.app.services.command_packs import CommandPackManager
from src.app.services.history_db import HistoryDatabase
from src.app.services.pipeline_drafts import PipelineDraftGenerator
from src.app.services.pipeline_flows import PipelineFlowManager
from src.app.services.runtime import RuntimeManager
from src.app.services.terminal_runtime import TerminalRuntimeManager

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


def get_runtime() -> RuntimeManager:
    return runtime_manager


def get_terminal_runtime() -> TerminalRuntimeManager:
    return terminal_runtime_manager


def get_command_pack_manager() -> CommandPackManager:
    return command_pack_manager


def get_history_database() -> HistoryDatabase:
    return history_database


def get_pipeline_flow_manager() -> PipelineFlowManager:
    return pipeline_flow_manager


def get_ai_model_manager() -> AIModelManager:
    return ai_model_manager


def get_pipeline_draft_generator() -> PipelineDraftGenerator:
    return pipeline_draft_generator
