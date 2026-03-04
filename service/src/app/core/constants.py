from src.app.core.settings import get_settings

settings = get_settings()

SERVICE_DIR = settings.service_dir
LOGS_DIR = settings.logs_dir
DATA_DIR = settings.data_dir
RUN_LOGS_DIR = settings.runs_logs_dir
TERMINAL_LOGS_DIR = settings.terminal_logs_dir
HISTORY_DB_PATH = settings.db_path
COMMAND_PACKS_DIR = settings.command_packs_dir
PIPELINE_FLOWS_DIR = settings.pipeline_flows_dir
DEFAULT_COMMAND_PACK_FILE = COMMAND_PACKS_DIR / "default.json"
CUSTOM_COMMAND_PACK_FILE = COMMAND_PACKS_DIR / "custom.json"

MAX_LINES_IN_MEMORY = settings.max_lines_in_memory
SHELL_EXECUTABLE = settings.shell_executable
DEFAULT_MANUAL_TERMINAL_COMMAND = settings.default_manual_terminal_command
DEFAULT_MANUAL_TERMINAL_CWD = settings.default_manual_terminal_cwd
PROMPT_STATE_MARKER = settings.prompt_state_marker
PIPELINE_OPEN_TERMINAL_COMMAND = settings.pipeline_open_terminal_command
