from src.app.core.constants import HISTORY_DB_PATH
from src.app.services.command_packs import CommandPackManager
from src.app.services.history_db import HistoryDatabase
from src.app.services.pipeline_flows import PipelineFlowManager
from src.app.services.runtime import RuntimeManager

history_database = HistoryDatabase(HISTORY_DB_PATH)
runtime_manager = RuntimeManager(history_db=history_database)
command_pack_manager = CommandPackManager()
pipeline_flow_manager = PipelineFlowManager()


def get_runtime() -> RuntimeManager:
    return runtime_manager


def get_command_pack_manager() -> CommandPackManager:
    return command_pack_manager


def get_history_database() -> HistoryDatabase:
    return history_database


def get_pipeline_flow_manager() -> PipelineFlowManager:
    return pipeline_flow_manager
