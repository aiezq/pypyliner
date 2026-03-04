from __future__ import annotations

import asyncio
import os
import re
import shlex
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Awaitable, Callable, Literal
from uuid import uuid4

from fastapi import WebSocket

from src.app.core.constants import (
    DEFAULT_MANUAL_TERMINAL_CWD,
    DEFAULT_MANUAL_TERMINAL_COMMAND,
    MAX_LINES_IN_MEMORY,
    PIPELINE_OPEN_TERMINAL_COMMAND,
    PROMPT_STATE_MARKER,
    RUN_LOGS_DIR,
    SHELL_EXECUTABLE,
    TERMINAL_LOGS_DIR,
)
from src.app.schemas.pipeline import PipelineRunCreatePayload
from src.app.schemas.terminal import (
    ManualTerminalAutocompletePayload,
    ManualTerminalCommandPayload,
    ManualTerminalCreatePayload,
    ManualTerminalRenamePayload,
)
from src.app.services.history_db import HistoryDatabase

StreamType = Literal["out", "err", "meta"]
StatusType = Literal["idle", "pending", "running", "success", "failed", "stopped"]
RunStatusType = Literal["running", "success", "failed", "stopped"]


@dataclass(slots=True)
class ServiceError(Exception):
    status_code: int
    detail: str


@dataclass(slots=True)
class TerminalLine:
    id: str
    stream: StreamType
    text: str
    created_at: str


@dataclass(slots=True)
class PipelineSessionState:
    id: str
    step_id: str
    title: str
    command: str
    status: StatusType
    exit_code: int | None
    lines: list[TerminalLine] = field(default_factory=list)


@dataclass(slots=True)
class PipelineRunState:
    id: str
    pipeline_name: str
    status: RunStatusType
    started_at: str
    finished_at: str | None
    log_file_path: Path
    sessions: list[PipelineSessionState]
    stop_requested: bool = False
    current_process: asyncio.subprocess.Process | None = None


@dataclass(slots=True)
class ManualTerminalState:
    id: str
    title: str
    prompt_user: str
    prompt_cwd: str
    status: StatusType
    exit_code: int | None
    created_at: str
    log_file_path: Path
    draft_command: str = ""
    lines: list[TerminalLine] = field(default_factory=list)
    stop_requested: bool = False
    current_process: asyncio.subprocess.Process | None = None


class EventHub:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    async def broadcast(self, event_type: str, data: dict) -> None:
        async with self._lock:
            clients = tuple(self._clients)

        stale_clients: list[WebSocket] = []
        payload = {"type": event_type, "data": data}
        for client in clients:
            try:
                await client.send_json(payload)
            except Exception:
                stale_clients.append(client)

        if stale_clients:
            async with self._lock:
                for stale in stale_clients:
                    self._clients.discard(stale)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:10]}"


def append_with_limit(items: list, item: object, max_size: int = MAX_LINES_IN_MEMORY) -> None:
    items.append(item)
    if len(items) > max_size:
        del items[: len(items) - max_size]


def append_text_line(path: Path, line: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as file:
        file.write(line + "\n")


class RuntimeManager:
    def __init__(self, history_db: HistoryDatabase | None = None) -> None:
        self.runs: dict[str, PipelineRunState] = {}
        self.manual_terminals: dict[str, ManualTerminalState] = {}
        self.history_db = history_db
        self.events = EventHub()
        self._log_locks: dict[Path, asyncio.Lock] = {}

    async def ensure_dirs(self) -> None:
        await asyncio.gather(
            asyncio.to_thread(RUN_LOGS_DIR.mkdir, parents=True, exist_ok=True),
            asyncio.to_thread(TERMINAL_LOGS_DIR.mkdir, parents=True, exist_ok=True),
        )

    def _serialize_line(self, line: TerminalLine) -> dict:
        return {
            "id": line.id,
            "stream": line.stream,
            "text": line.text,
            "created_at": line.created_at,
        }

    def _serialize_session(self, session: PipelineSessionState) -> dict:
        return {
            "id": session.id,
            "step_id": session.step_id,
            "title": session.title,
            "command": session.command,
            "status": session.status,
            "exit_code": session.exit_code,
            "lines": [self._serialize_line(line) for line in session.lines],
        }

    def _serialize_run(self, run: PipelineRunState) -> dict:
        return {
            "id": run.id,
            "pipeline_name": run.pipeline_name,
            "status": run.status,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "log_file_path": str(run.log_file_path),
            "sessions": [self._serialize_session(session) for session in run.sessions],
        }

    def _serialize_terminal(self, terminal: ManualTerminalState) -> dict:
        return {
            "id": terminal.id,
            "title": terminal.title,
            "prompt_user": terminal.prompt_user,
            "prompt_cwd": terminal.prompt_cwd,
            "status": terminal.status,
            "exit_code": terminal.exit_code,
            "created_at": terminal.created_at,
            "draft_command": terminal.draft_command,
            "log_file_path": str(terminal.log_file_path),
            "lines": [self._serialize_line(line) for line in terminal.lines],
        }

    def snapshot(self) -> dict:
        return {
            "runs": self.list_runs(),
            "manual_terminals": [
                self._serialize_terminal(terminal)
                for terminal in self.manual_terminals.values()
            ],
        }

    def list_runs(self) -> list[dict]:
        ordered = sorted(
            self.runs.values(),
            key=lambda run: run.started_at,
            reverse=True,
        )
        return [self._serialize_run(run) for run in ordered]

    def list_manual_terminals(self) -> list[dict]:
        return [
            self._serialize_terminal(terminal)
            for terminal in self.manual_terminals.values()
        ]

    def history(self) -> dict:
        if self.history_db is None:
            return {"runs": self.list_runs(), "manual_terminal_history": []}
        return self.history_db.fetch_history()

    def get_run(self, run_id: str) -> dict:
        run = self.runs.get(run_id)
        if run is None:
            raise ServiceError(status_code=404, detail="Run not found")
        return self._serialize_run(run)

    def get_run_log_path(self, run_id: str) -> Path:
        run = self.runs.get(run_id)
        if run is None:
            raise ServiceError(status_code=404, detail="Run not found")
        return run.log_file_path

    @staticmethod
    def get_terminal_log_path(terminal_id: str) -> Path:
        if not terminal_id.startswith("terminal_"):
            raise ServiceError(status_code=404, detail="Terminal not found")
        return TERMINAL_LOGS_DIR / f"{terminal_id}.log"

    def _get_log_lock(self, path: Path) -> asyncio.Lock:
        lock = self._log_locks.get(path)
        if lock is None:
            lock = asyncio.Lock()
            self._log_locks[path] = lock
        return lock

    async def _append_log(self, path: Path, line: str) -> None:
        lock = self._get_log_lock(path)
        async with lock:
            await asyncio.to_thread(append_text_line, path, line)

    async def _terminate_process(self, process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            return
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=2.0)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()

    @staticmethod
    def _prompt_probe_command() -> str:
        return f"printf '{PROMPT_STATE_MARKER}\\t%s\\t%s\\n' \"$USER\" \"$PWD\" >&2"

    @staticmethod
    def _normalize_prompt_cwd(raw_cwd: str) -> str:
        home_path = str(DEFAULT_MANUAL_TERMINAL_CWD)
        if raw_cwd == home_path:
            return "~"
        if raw_cwd.startswith(home_path + "/"):
            return "~" + raw_cwd[len(home_path) :]
        return raw_cwd

    def _parse_prompt_probe_line(self, text: str) -> tuple[str, str] | None:
        marker_prefix = f"{PROMPT_STATE_MARKER}\t"
        if not text.startswith(marker_prefix):
            return None

        payload = text[len(marker_prefix) :]
        parts = payload.split("\t", 1)
        if len(parts) != 2:
            return None

        user = parts[0].strip() or "operator"
        cwd = parts[1].strip() or str(DEFAULT_MANUAL_TERMINAL_CWD)
        return user, self._normalize_prompt_cwd(cwd)

    async def _request_manual_prompt_probe(self, terminal: ManualTerminalState) -> None:
        process = terminal.current_process
        if process is None or process.stdin is None or process.returncode is not None:
            return

        process.stdin.write((self._prompt_probe_command() + "\n").encode())
        try:
            await process.stdin.drain()
        except (BrokenPipeError, ConnectionResetError):
            return

    def _next_manual_terminal_title(self) -> str:
        number = len(self.manual_terminals) + 1
        title = f"Manual terminal #{number}"
        existing_titles = {terminal.title for terminal in self.manual_terminals.values()}
        while title in existing_titles:
            number += 1
            title = f"Manual terminal #{number}"
        return title

    @staticmethod
    def _split_completion_input(command: str) -> tuple[str, str]:
        if not command:
            return "", ""
        if command[-1].isspace():
            return command, ""

        match = re.search(r"\S+$", command)
        if match is None:
            return command, ""
        token = match.group(0)
        return command[: -len(token)], token

    @staticmethod
    def _common_prefix(values: list[str]) -> str:
        if not values:
            return ""
        return os.path.commonprefix(values)

    @staticmethod
    def _resolve_terminal_cwd(terminal: ManualTerminalState) -> Path:
        raw = terminal.prompt_cwd.strip()
        if not raw or raw == "~":
            return DEFAULT_MANUAL_TERMINAL_CWD
        if raw.startswith("~/"):
            return DEFAULT_MANUAL_TERMINAL_CWD / raw[2:]
        path = Path(raw).expanduser()
        if path.is_absolute():
            return path
        return (DEFAULT_MANUAL_TERMINAL_CWD / path).resolve()

    @staticmethod
    def _collect_path_matches(cwd: Path, token_body: str, max_items: int = 200) -> list[str]:
        if token_body == "~":
            return ["~/"]

        if "/" in token_body:
            prefix_dir, partial = token_body.rsplit("/", 1)
            if token_body.startswith("/") and prefix_dir == "":
                search_dir = Path("/")
            elif prefix_dir.startswith("~"):
                search_dir = Path(prefix_dir).expanduser()
            elif prefix_dir == "":
                search_dir = cwd
            else:
                search_dir = (cwd / prefix_dir).expanduser()
            typed_base = f"{prefix_dir}/"
        else:
            partial = token_body
            search_dir = cwd
            typed_base = ""

        if not search_dir.exists() or not search_dir.is_dir():
            return []

        matches: list[str] = []
        for entry in sorted(search_dir.iterdir(), key=lambda item: item.name.lower()):
            name = entry.name
            if not name.startswith(partial):
                continue
            suffix = "/" if entry.is_dir() else ""
            matches.append(f"{typed_base}{name}{suffix}")
            if len(matches) >= max_items:
                break
        return matches

    @classmethod
    async def _collect_completion_matches(
        cls,
        terminal: ManualTerminalState,
        command: str,
    ) -> tuple[str, str, list[str]]:
        prefix, token = cls._split_completion_input(command)
        quote = ""
        token_body = token
        if token_body.startswith('"') or token_body.startswith("'"):
            quote = token_body[0]
            token_body = token_body[1:]

        cwd = cls._resolve_terminal_cwd(terminal)
        matches = await asyncio.to_thread(cls._collect_path_matches, cwd, token_body)
        return prefix, quote, matches

    async def _execute_command(
        self,
        command: str,
        on_line: Callable[[StreamType, str], Awaitable[None]],
        set_process: Callable[[asyncio.subprocess.Process | None], None],
    ) -> int:
        process = await asyncio.create_subprocess_shell(
            command,
            executable=SHELL_EXECUTABLE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        set_process(process)
        await on_line("meta", f"$ {command}")

        async def stream_reader(
            stream: asyncio.StreamReader | None,
            stream_name: Literal["out", "err"],
        ) -> None:
            if stream is None:
                return
            while True:
                chunk = await stream.readline()
                if not chunk:
                    break
                text = chunk.decode(errors="replace").rstrip("\n")
                if text:
                    await on_line(stream_name, text)

        stdout_task = asyncio.create_task(stream_reader(process.stdout, "out"))
        stderr_task = asyncio.create_task(stream_reader(process.stderr, "err"))

        try:
            return_code = await process.wait()
            await asyncio.gather(stdout_task, stderr_task)
            return return_code
        finally:
            set_process(None)

    async def _append_pipeline_line(
        self,
        run: PipelineRunState,
        session: PipelineSessionState,
        stream: StreamType,
        text: str,
    ) -> None:
        line = TerminalLine(
            id=make_id("line"),
            stream=stream,
            text=text,
            created_at=now_iso(),
        )
        append_with_limit(session.lines, line)
        await self._append_log(
            run.log_file_path,
            f"[{line.created_at}] [{session.title}] [{stream}] {text}",
        )
        await self.events.broadcast(
            "run_session_line",
            {
                "run_id": run.id,
                "session_id": session.id,
                "line": self._serialize_line(line),
            },
        )

    async def _append_manual_line(
        self,
        terminal: ManualTerminalState,
        stream: StreamType,
        text: str,
    ) -> None:
        line = TerminalLine(
            id=make_id("line"),
            stream=stream,
            text=text,
            created_at=now_iso(),
        )
        append_with_limit(terminal.lines, line)
        await self._append_log(
            terminal.log_file_path,
            f"[{line.created_at}] [{terminal.title}] [{stream}] {text}",
        )
        await self.events.broadcast(
            "terminal_line",
            {
                "terminal_id": terminal.id,
                "line": self._serialize_line(line),
            },
        )

    def _persist_run(self, run: PipelineRunState, include_sessions: bool = False) -> None:
        if self.history_db is None:
            return
        self.history_db.upsert_run(
            run_id=run.id,
            pipeline_name=run.pipeline_name,
            status=run.status,
            started_at=run.started_at,
            finished_at=run.finished_at,
            log_file_path=str(run.log_file_path),
        )
        if include_sessions:
            for position, session in enumerate(run.sessions):
                self._persist_run_session(run, session, position=position)

    def _persist_run_session(
        self,
        run: PipelineRunState,
        session: PipelineSessionState,
        position: int | None = None,
    ) -> None:
        if self.history_db is None:
            return
        if position is None:
            try:
                position = run.sessions.index(session)
            except ValueError:
                position = 0
        self.history_db.upsert_run_session(
            session_id=session.id,
            run_id=run.id,
            step_id=session.step_id,
            position=position,
            title=session.title,
            command=session.command,
            status=session.status,
            exit_code=session.exit_code,
        )

    def _persist_manual_terminal(
        self,
        terminal: ManualTerminalState,
        *,
        updated_at: str | None = None,
        closed_at: str | None = None,
    ) -> None:
        if self.history_db is None:
            return
        self.history_db.upsert_manual_terminal(
            terminal_id=terminal.id,
            title=terminal.title,
            created_at=terminal.created_at,
            updated_at=updated_at or now_iso(),
            closed_at=closed_at,
            log_file_path=str(terminal.log_file_path),
        )

    async def _emit_run_status(self, run: PipelineRunState) -> None:
        self._persist_run(run)
        await self.events.broadcast(
            "run_status",
            {
                "run_id": run.id,
                "status": run.status,
                "finished_at": run.finished_at,
            },
        )

    async def _emit_run_session_status(
        self,
        run: PipelineRunState,
        session: PipelineSessionState,
    ) -> None:
        self._persist_run_session(run, session)
        await self.events.broadcast(
            "run_session_status",
            {
                "run_id": run.id,
                "session_id": session.id,
                "status": session.status,
                "exit_code": session.exit_code,
            },
        )

    async def _emit_terminal_status(self, terminal: ManualTerminalState) -> None:
        self._persist_manual_terminal(terminal)
        await self.events.broadcast(
            "terminal_status",
            {
                "terminal_id": terminal.id,
                "status": terminal.status,
                "exit_code": terminal.exit_code,
            },
        )

    @staticmethod
    def _is_process_running(process: asyncio.subprocess.Process | None) -> bool:
        return process is not None and process.returncode is None

    @staticmethod
    def _is_pipeline_open_terminal_command(command: str) -> bool:
        normalized = " ".join(command.strip().split())
        lowered = normalized.lower()
        if lowered in {
            PIPELINE_OPEN_TERMINAL_COMMAND,
            "operator.open_terminal",
            "open_terminal",
        }:
            return True
        return normalized.startswith("bash -lc") and "echo Terminal session started" in normalized

    async def _start_manual_terminal_shell(self, terminal: ManualTerminalState) -> None:
        if self._is_process_running(terminal.current_process):
            return

        argv = shlex.split(DEFAULT_MANUAL_TERMINAL_COMMAND)
        if not argv:
            raise ServiceError(status_code=500, detail="Invalid default terminal command")

        process = await asyncio.create_subprocess_exec(
            *argv,
            cwd=str(DEFAULT_MANUAL_TERMINAL_CWD),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        terminal.current_process = process
        terminal.stop_requested = False
        terminal.status = "running"
        terminal.exit_code = None
        await self._append_manual_line(
            terminal,
            "meta",
            f"[start] interactive shell started: {DEFAULT_MANUAL_TERMINAL_COMMAND} "
            f"(cwd={DEFAULT_MANUAL_TERMINAL_CWD})",
        )
        await self._emit_terminal_status(terminal)

        asyncio.create_task(self._stream_manual_terminal_output(terminal, process.stdout, "out"))
        asyncio.create_task(self._stream_manual_terminal_output(terminal, process.stderr, "err"))
        asyncio.create_task(self._watch_manual_terminal_process(terminal, process))
        await self._request_manual_prompt_probe(terminal)

    async def _stream_manual_terminal_output(
        self,
        terminal: ManualTerminalState,
        stream: asyncio.StreamReader | None,
        stream_name: Literal["out", "err"],
    ) -> None:
        if stream is None:
            return
        try:
            while True:
                chunk = await stream.readline()
                if not chunk:
                    break
                text = chunk.decode(errors="replace").rstrip("\n")
                if text:
                    parsed_prompt_state = self._parse_prompt_probe_line(text)
                    if parsed_prompt_state is not None:
                        user, cwd = parsed_prompt_state
                        if user != terminal.prompt_user or cwd != terminal.prompt_cwd:
                            terminal.prompt_user = user
                            terminal.prompt_cwd = cwd
                            await self.events.broadcast(
                                "terminal_updated",
                                {"terminal": self._serialize_terminal(terminal)},
                            )
                        continue
                    await self._append_manual_line(terminal, stream_name, text)
        except Exception:
            await self._append_manual_line(
                terminal,
                "meta",
                "[warn] terminal output stream was interrupted",
            )

    async def _watch_manual_terminal_process(
        self,
        terminal: ManualTerminalState,
        process: asyncio.subprocess.Process,
    ) -> None:
        return_code = await process.wait()
        if terminal.current_process is process:
            terminal.current_process = None

        if terminal.id not in self.manual_terminals:
            return

        if terminal.stop_requested:
            terminal.status = "stopped"
            terminal.exit_code = -1
            await self._append_manual_line(
                terminal,
                "meta",
                "[stopped] interactive shell terminated by operator",
            )
            await self._emit_terminal_status(terminal)
            return

        terminal.status = "stopped"
        terminal.exit_code = return_code
        await self._append_manual_line(
            terminal,
            "meta",
            f"[finish] interactive shell exited with code {return_code}",
        )
        await self._emit_terminal_status(terminal)

    async def create_pipeline_run(self, payload: PipelineRunCreatePayload) -> dict:
        run_id = make_id("run")
        started_at = now_iso()
        log_file_path = RUN_LOGS_DIR / f"{run_id}.log"

        sessions: list[PipelineSessionState] = []
        for index, step in enumerate(payload.steps, start=1):
            session = PipelineSessionState(
                id=make_id("session"),
                step_id=make_id("step"),
                title=f"Terminal #{index} - {step.label}",
                command=step.command,
                status="pending",
                exit_code=None,
            )
            sessions.append(session)

        run = PipelineRunState(
            id=run_id,
            pipeline_name=payload.pipeline_name,
            status="running",
            started_at=started_at,
            finished_at=None,
            log_file_path=log_file_path,
            sessions=sessions,
        )
        self.runs[run.id] = run
        self._persist_run(run, include_sessions=True)
        await self._append_log(log_file_path, f"[{started_at}] [run] started: {run.pipeline_name}")
        await self.events.broadcast("run_created", {"run": self._serialize_run(run)})
        asyncio.create_task(self._execute_pipeline_run(run))
        return self._serialize_run(run)

    async def _execute_pipeline_run(self, run: PipelineRunState) -> None:
        run_failed = False
        for session in run.sessions:
            if run.stop_requested:
                break

            session.status = "running"
            session.exit_code = None
            await self._emit_run_session_status(run, session)
            await self._append_pipeline_line(run, session, "meta", "[start] step started")

            if self._is_pipeline_open_terminal_command(session.command):
                await self._append_pipeline_line(
                    run,
                    session,
                    "meta",
                    "[action] creating interactive terminal session",
                )
                created_terminal = await self.create_manual_terminal(
                    ManualTerminalCreatePayload(
                        title=f"Pipeline terminal - {session.title}",
                    )
                )
                session.status = "success"
                session.exit_code = 0
                await self._append_pipeline_line(
                    run,
                    session,
                    "meta",
                    f"[finish] terminal created: {created_terminal['id']}",
                )
                await self._emit_run_session_status(run, session)
                continue

            return_code = await self._execute_command(
                session.command,
                on_line=lambda stream, text: self._append_pipeline_line(run, session, stream, text),
                set_process=lambda process: setattr(run, "current_process", process),
            )

            if run.stop_requested:
                session.status = "stopped"
                session.exit_code = -1
                await self._append_pipeline_line(
                    run,
                    session,
                    "meta",
                    "[stopped] interrupted by operator",
                )
                await self._emit_run_session_status(run, session)
                break

            if return_code == 0:
                session.status = "success"
                session.exit_code = 0
                await self._append_pipeline_line(
                    run,
                    session,
                    "meta",
                    "[finish] step completed",
                )
                await self._emit_run_session_status(run, session)
                continue

            session.status = "failed"
            session.exit_code = return_code
            run_failed = True
            await self._append_pipeline_line(
                run,
                session,
                "meta",
                f"[finish] step failed with code {return_code}",
            )
            await self._emit_run_session_status(run, session)
            break

        if run.stop_requested:
            run.status = "stopped"
            for session in run.sessions:
                if session.status == "pending":
                    session.status = "stopped"
                    session.exit_code = -1
                    await self._append_pipeline_line(
                        run,
                        session,
                        "meta",
                        "[skipped] run was stopped before this step",
                    )
                    await self._emit_run_session_status(run, session)
        elif run_failed:
            run.status = "failed"
        else:
            run.status = "success"

        run.finished_at = now_iso()
        await self._append_log(
            run.log_file_path,
            f"[{run.finished_at}] [run] finished with status: {run.status}",
        )
        await self._emit_run_status(run)

    async def stop_pipeline_run(self, run_id: str) -> dict:
        run = self.runs.get(run_id)
        if run is None:
            raise ServiceError(status_code=404, detail="Run not found")
        if run.status != "running":
            return self._serialize_run(run)

        run.stop_requested = True
        await self._append_log(run.log_file_path, f"[{now_iso()}] [run] stop requested")
        if run.current_process and run.current_process.returncode is None:
            asyncio.create_task(self._terminate_process(run.current_process))
        return self._serialize_run(run)

    async def create_manual_terminal(self, payload: ManualTerminalCreatePayload) -> dict:
        terminal_id = make_id("terminal")
        title = payload.title or self._next_manual_terminal_title()
        terminal = ManualTerminalState(
            id=terminal_id,
            title=title,
            prompt_user=os.environ.get("USER", "operator"),
            prompt_cwd="~",
            status="idle",
            exit_code=None,
            created_at=now_iso(),
            log_file_path=TERMINAL_LOGS_DIR / f"{terminal_id}.log",
        )
        self.manual_terminals[terminal.id] = terminal
        self._persist_manual_terminal(
            terminal,
            updated_at=terminal.created_at,
            closed_at=None,
        )
        await self._append_log(
            terminal.log_file_path,
            f"[{terminal.created_at}] [terminal] created",
        )
        await self._append_manual_line(terminal, "meta", "[ready] terminal created")
        await self._start_manual_terminal_shell(terminal)
        await self.events.broadcast(
            "terminal_created",
            {"terminal": self._serialize_terminal(terminal)},
        )
        return self._serialize_terminal(terminal)

    async def run_manual_terminal_command(
        self,
        terminal_id: str,
        payload: ManualTerminalCommandPayload,
    ) -> dict:
        terminal = self.manual_terminals.get(terminal_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal not found")

        command = payload.command.strip()
        if not command:
            raise ServiceError(status_code=400, detail="Command must not be empty")

        if not self._is_process_running(terminal.current_process):
            await self._start_manual_terminal_shell(terminal)

        process = terminal.current_process
        if process is None or process.stdin is None:
            raise ServiceError(status_code=500, detail="Terminal shell is not available")

        terminal.draft_command = ""
        terminal.status = "running"
        terminal.exit_code = None
        terminal.stop_requested = False
        if self.history_db is not None:
            self.history_db.append_manual_terminal_command(
                terminal_id=terminal.id,
                command=command,
                created_at=now_iso(),
            )
        await self._append_manual_line(terminal, "meta", f"[input] {command}")
        process.stdin.write((command + "\n").encode())
        process.stdin.write((self._prompt_probe_command() + "\n").encode())
        try:
            await process.stdin.drain()
        except (BrokenPipeError, ConnectionResetError) as error:
            raise ServiceError(status_code=409, detail="Terminal shell is not writable") from error
        await self._emit_terminal_status(terminal)
        return self._serialize_terminal(terminal)

    async def complete_manual_terminal_command(
        self,
        terminal_id: str,
        payload: ManualTerminalAutocompletePayload,
    ) -> dict:
        terminal = self.manual_terminals.get(terminal_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal not found")

        command = payload.command
        base_command = payload.base_command if payload.base_command is not None else command
        prefix, quote, raw_matches = await self._collect_completion_matches(terminal, base_command)
        matches = [f"{quote}{item}" for item in raw_matches]

        if not raw_matches:
            completed_command = command
        elif payload.cycle_index is not None:
            selected_index = payload.cycle_index % len(raw_matches)
            completed_command = f"{prefix}{quote}{raw_matches[selected_index]}"
        else:
            token_prefix = quote
            current_token = command[len(prefix) :] if command.startswith(prefix) else ""
            replacement = current_token[len(token_prefix) :] if current_token.startswith(token_prefix) else current_token
            common = self._common_prefix(raw_matches)
            if common and len(common) > len(replacement):
                completed_command = f"{prefix}{quote}{common}"
            else:
                completed_command = command
        return {
            "terminal_id": terminal_id,
            "command": command,
            "base_command": base_command,
            "completed_command": completed_command,
            "matches": matches,
        }

    async def stop_manual_terminal(self, terminal_id: str) -> dict:
        terminal = self.manual_terminals.get(terminal_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal not found")
        if not self._is_process_running(terminal.current_process):
            return self._serialize_terminal(terminal)

        terminal.stop_requested = True
        await self._append_manual_line(terminal, "meta", "[stop] stop requested")
        process = terminal.current_process
        if process is not None:
            await self._terminate_process(process)

        for _ in range(20):
            if terminal.current_process is None and terminal.status != "running":
                break
            await asyncio.sleep(0.05)

        if terminal.current_process is None and terminal.status == "running":
            terminal.status = "stopped"
            terminal.exit_code = -1
            await self._emit_terminal_status(terminal)
        return self._serialize_terminal(terminal)

    async def rename_manual_terminal(
        self,
        terminal_id: str,
        payload: ManualTerminalRenamePayload,
    ) -> dict:
        terminal = self.manual_terminals.get(terminal_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal not found")

        next_title = payload.title.strip()
        if not next_title:
            raise ServiceError(status_code=400, detail="Terminal title must not be empty")
        if next_title == terminal.title:
            return self._serialize_terminal(terminal)

        previous_title = terminal.title
        terminal.title = next_title
        self._persist_manual_terminal(terminal)
        await self._append_log(
            terminal.log_file_path,
            f"[{now_iso()}] [terminal] renamed: {previous_title} -> {next_title}",
        )
        await self.events.broadcast(
            "terminal_updated",
            {"terminal": self._serialize_terminal(terminal)},
        )
        return self._serialize_terminal(terminal)

    async def clear_manual_terminal(self, terminal_id: str) -> dict:
        terminal = self.manual_terminals.get(terminal_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal not found")

        terminal.lines = []
        terminal.exit_code = None
        terminal.status = "running" if self._is_process_running(terminal.current_process) else "idle"
        await self._append_manual_line(terminal, "meta", "[ready] terminal log cleared")
        await self._emit_terminal_status(terminal)
        return self._serialize_terminal(terminal)

    async def close_manual_terminal(self, terminal_id: str) -> None:
        terminal = self.manual_terminals.get(terminal_id)
        if terminal is None:
            raise ServiceError(status_code=404, detail="Terminal not found")

        terminal.stop_requested = True
        process = terminal.current_process
        if self._is_process_running(process) and process is not None:
            await self._terminate_process(process)

        timestamp = now_iso()
        self._persist_manual_terminal(
            terminal,
            updated_at=timestamp,
            closed_at=timestamp,
        )
        self.manual_terminals.pop(terminal_id, None)
        await self.events.broadcast("terminal_closed", {"terminal_id": terminal_id})
