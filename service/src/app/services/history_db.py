from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from sqlalchemy import delete, desc
from sqlmodel import select

from src.app.core.database import init_db, session_scope
from src.app.models.db import (
    ManualTerminalCommandRecord,
    ManualTerminalHistoryRecord,
    RunRecord,
    RunSessionRecord,
)
from src.app.schemas.service_types import (
    HistoryData,
    ManualTerminalHistoryItemData,
    PipelineRunData,
    PipelineSessionData,
)
RUN_STARTED_AT_COLUMN: Any = cast(Any, RunRecord).started_at
RUN_SESSION_RUN_ID_COLUMN: Any = cast(Any, RunSessionRecord).run_id
RUN_SESSION_POSITION_COLUMN: Any = cast(Any, RunSessionRecord).position
TERMINAL_UPDATED_AT_COLUMN: Any = cast(Any, ManualTerminalHistoryRecord).updated_at
TERMINAL_COMMAND_TERMINAL_ID_COLUMN: Any = cast(Any, ManualTerminalCommandRecord).terminal_id
TERMINAL_COMMAND_ID_COLUMN: Any = cast(Any, ManualTerminalCommandRecord).id


class HistoryDatabase:
    def __init__(self, db_path: Path | None = None) -> None:
        # Path is kept for backwards compatibility with existing construction code.
        self.db_path = db_path

    def ensure_ready(self) -> None:
        init_db()

    def upsert_run(
        self,
        *,
        run_id: str,
        pipeline_name: str,
        status: str,
        started_at: str,
        finished_at: str | None,
        log_file_path: str,
    ) -> None:
        with session_scope() as session:
            run = session.get(RunRecord, run_id)
            if run is None:
                run = RunRecord(
                    id=run_id,
                    pipeline_name=pipeline_name,
                    status=status,
                    started_at=started_at,
                    finished_at=finished_at,
                    log_file_path=log_file_path,
                )
                session.add(run)
            else:
                run.pipeline_name = pipeline_name
                run.status = status
                run.started_at = started_at
                run.finished_at = finished_at
                run.log_file_path = log_file_path
            session.commit()

    def upsert_run_session(
        self,
        *,
        session_id: str,
        run_id: str,
        step_id: str,
        position: int,
        title: str,
        command: str,
        status: str,
        exit_code: int | None,
    ) -> None:
        with session_scope() as session:
            run_session = session.get(RunSessionRecord, session_id)
            if run_session is None:
                run_session = RunSessionRecord(
                    id=session_id,
                    run_id=run_id,
                    step_id=step_id,
                    position=position,
                    title=title,
                    command=command,
                    status=status,
                    exit_code=exit_code,
                )
                session.add(run_session)
            else:
                run_session.run_id = run_id
                run_session.step_id = step_id
                run_session.position = position
                run_session.title = title
                run_session.command = command
                run_session.status = status
                run_session.exit_code = exit_code
            session.commit()

    def upsert_manual_terminal(
        self,
        *,
        terminal_id: str,
        title: str,
        created_at: str,
        updated_at: str,
        closed_at: str | None,
        log_file_path: str,
    ) -> None:
        with session_scope() as session:
            terminal = session.get(ManualTerminalHistoryRecord, terminal_id)
            if terminal is None:
                terminal = ManualTerminalHistoryRecord(
                    terminal_id=terminal_id,
                    title=title,
                    created_at=created_at,
                    updated_at=updated_at,
                    closed_at=closed_at,
                    log_file_path=log_file_path,
                )
                session.add(terminal)
            else:
                terminal.title = title
                terminal.created_at = created_at
                terminal.updated_at = updated_at
                terminal.closed_at = closed_at
                terminal.log_file_path = log_file_path
            session.commit()

    def append_manual_terminal_command(
        self,
        *,
        terminal_id: str,
        command: str,
        created_at: str,
    ) -> None:
        with session_scope() as session:
            session.add(
                ManualTerminalCommandRecord(
                    terminal_id=terminal_id,
                    command=command,
                    created_at=created_at,
                )
            )
            terminal = session.get(ManualTerminalHistoryRecord, terminal_id)
            if terminal is not None:
                terminal.updated_at = created_at
                terminal.closed_at = None
            session.commit()

    def fetch_history(
        self,
        *,
        runs_limit: int = 200,
        terminal_limit: int = 300,
    ) -> HistoryData:
        with session_scope() as session:
            run_rows = session.exec(
                select(RunRecord)
                .order_by(desc(RUN_STARTED_AT_COLUMN))
                .limit(runs_limit)
            ).all()

            run_ids = [run.id for run in run_rows]
            sessions_by_run: dict[str, list[PipelineSessionData]] = {
                run_id: [] for run_id in run_ids
            }
            if run_ids:
                session_rows = session.exec(
                    select(RunSessionRecord)
                    .where(RUN_SESSION_RUN_ID_COLUMN.in_(run_ids))
                    .order_by(RUN_SESSION_RUN_ID_COLUMN, RUN_SESSION_POSITION_COLUMN)
                ).all()
                for row in session_rows:
                    sessions_by_run[row.run_id].append(
                        {
                            "id": row.id,
                            "step_id": row.step_id,
                            "title": row.title,
                            "command": row.command,
                            "status": row.status,
                            "exit_code": row.exit_code,
                            "lines": [],
                        }
                    )

            runs: list[PipelineRunData] = [
                {
                    "id": row.id,
                    "pipeline_name": row.pipeline_name,
                    "status": row.status,
                    "started_at": row.started_at,
                    "finished_at": row.finished_at,
                    "log_file_path": row.log_file_path,
                    "sessions": sessions_by_run.get(row.id, []),
                }
                for row in run_rows
            ]

            terminal_rows = session.exec(
                select(ManualTerminalHistoryRecord)
                .order_by(desc(TERMINAL_UPDATED_AT_COLUMN))
                .limit(terminal_limit)
            ).all()

            terminals_history: list[ManualTerminalHistoryItemData] = []
            for row in terminal_rows:
                command_rows = session.exec(
                    select(ManualTerminalCommandRecord)
                    .where(TERMINAL_COMMAND_TERMINAL_ID_COLUMN == row.terminal_id)
                    .order_by(desc(TERMINAL_COMMAND_ID_COLUMN))
                    .limit(500)
                ).all()
                commands = [item.command for item in reversed(command_rows)]
                terminals_history.append(
                    {
                        "terminal_id": row.terminal_id,
                        "title": row.title,
                        "created_at": row.created_at,
                        "updated_at": row.updated_at,
                        "closed_at": row.closed_at,
                        "log_file_path": row.log_file_path,
                        "commands": commands,
                    }
                )

            return {
                "runs": runs,
                "manual_terminal_history": terminals_history,
            }

    def clear_history(self) -> None:
        with session_scope() as session:
            session.exec(delete(ManualTerminalCommandRecord))
            session.exec(delete(ManualTerminalHistoryRecord))
            session.exec(delete(RunSessionRecord))
            session.exec(delete(RunRecord))
            session.commit()
