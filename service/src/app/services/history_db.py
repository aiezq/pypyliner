from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from sqlalchemy import delete, desc
from sqlmodel import select

from src.app.core.database import init_db, session_scope
from src.app.models.db import RunRecord, RunSessionRecord
from src.app.schemas.service_types import HistoryData, PipelineRunData, PipelineSessionData

RUN_STARTED_AT_COLUMN: Any = cast(Any, RunRecord).started_at
RUN_SESSION_RUN_ID_COLUMN: Any = cast(Any, RunSessionRecord).run_id
RUN_SESSION_POSITION_COLUMN: Any = cast(Any, RunSessionRecord).position


class HistoryDatabase:
    def __init__(self, db_path: Path | None = None) -> None:
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

    def fetch_history(
        self,
        *,
        runs_limit: int = 200,
    ) -> HistoryData:
        with session_scope() as session:
            run_rows = session.exec(
                select(RunRecord)
                .order_by(desc(RUN_STARTED_AT_COLUMN))
                .limit(runs_limit)
            ).all()

            run_ids = [run.id for run in run_rows]
            sessions_by_run: dict[str, list[PipelineSessionData]] = {run_id: [] for run_id in run_ids}
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

            return {
                "runs": [
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
            }

    def clear(self) -> None:
        with session_scope() as session:
            session.exec(delete(RunSessionRecord))
            session.exec(delete(RunRecord))
            session.commit()
