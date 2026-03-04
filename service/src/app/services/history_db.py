from __future__ import annotations

import sqlite3
from pathlib import Path
from threading import Lock


class HistoryDatabase:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._conn: sqlite3.Connection | None = None
        self._lock = Lock()

    def _connect(self) -> sqlite3.Connection:
        if self._conn is None:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(self.db_path, check_same_thread=False)
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            self._conn = connection
        return self._conn

    def ensure_ready(self) -> None:
        with self._lock:
            conn = self._connect()
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    pipeline_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    log_file_path TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS run_sessions (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    step_id TEXT NOT NULL,
                    position INTEGER NOT NULL DEFAULT 0,
                    title TEXT NOT NULL,
                    command TEXT NOT NULL,
                    status TEXT NOT NULL,
                    exit_code INTEGER,
                    FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_run_sessions_run_id_position
                ON run_sessions(run_id, position);

                CREATE TABLE IF NOT EXISTS manual_terminals_history (
                    terminal_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    closed_at TEXT,
                    log_file_path TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS manual_terminal_commands (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    terminal_id TEXT NOT NULL,
                    command TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(terminal_id)
                        REFERENCES manual_terminals_history(terminal_id)
                        ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_manual_terminal_commands_terminal_id
                ON manual_terminal_commands(terminal_id, id DESC);
                """
            )
            conn.commit()

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
        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                INSERT INTO runs (
                    id, pipeline_name, status, started_at, finished_at, log_file_path
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    pipeline_name = excluded.pipeline_name,
                    status = excluded.status,
                    started_at = excluded.started_at,
                    finished_at = excluded.finished_at,
                    log_file_path = excluded.log_file_path
                """,
                (run_id, pipeline_name, status, started_at, finished_at, log_file_path),
            )
            conn.commit()

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
        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                INSERT INTO run_sessions (
                    id, run_id, step_id, position, title, command, status, exit_code
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    run_id = excluded.run_id,
                    step_id = excluded.step_id,
                    position = excluded.position,
                    title = excluded.title,
                    command = excluded.command,
                    status = excluded.status,
                    exit_code = excluded.exit_code
                """,
                (
                    session_id,
                    run_id,
                    step_id,
                    position,
                    title,
                    command,
                    status,
                    exit_code,
                ),
            )
            conn.commit()

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
        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                INSERT INTO manual_terminals_history (
                    terminal_id, title, created_at, updated_at, closed_at, log_file_path
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(terminal_id) DO UPDATE SET
                    title = excluded.title,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    closed_at = excluded.closed_at,
                    log_file_path = excluded.log_file_path
                """,
                (
                    terminal_id,
                    title,
                    created_at,
                    updated_at,
                    closed_at,
                    log_file_path,
                ),
            )
            conn.commit()

    def append_manual_terminal_command(
        self,
        *,
        terminal_id: str,
        command: str,
        created_at: str,
    ) -> None:
        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                INSERT INTO manual_terminal_commands (terminal_id, command, created_at)
                VALUES (?, ?, ?)
                """,
                (terminal_id, command, created_at),
            )
            conn.execute(
                """
                UPDATE manual_terminals_history
                SET updated_at = ?, closed_at = NULL
                WHERE terminal_id = ?
                """,
                (created_at, terminal_id),
            )
            conn.commit()

    def fetch_history(self, *, runs_limit: int = 200, terminal_limit: int = 300) -> dict:
        with self._lock:
            conn = self._connect()
            run_rows = conn.execute(
                """
                SELECT id, pipeline_name, status, started_at, finished_at, log_file_path
                FROM runs
                ORDER BY started_at DESC
                LIMIT ?
                """,
                (runs_limit,),
            ).fetchall()

            run_ids = [row["id"] for row in run_rows]
            sessions_by_run: dict[str, list[dict]] = {run_id: [] for run_id in run_ids}
            if run_ids:
                placeholders = ",".join("?" for _ in run_ids)
                session_rows = conn.execute(
                    f"""
                    SELECT id, run_id, step_id, title, command, status, exit_code
                    FROM run_sessions
                    WHERE run_id IN ({placeholders})
                    ORDER BY run_id ASC, position ASC
                    """,
                    run_ids,
                ).fetchall()
                for row in session_rows:
                    sessions_by_run[row["run_id"]].append(
                        {
                            "id": row["id"],
                            "step_id": row["step_id"],
                            "title": row["title"],
                            "command": row["command"],
                            "status": row["status"],
                            "exit_code": row["exit_code"],
                            "lines": [],
                        }
                    )

            runs = [
                {
                    "id": row["id"],
                    "pipeline_name": row["pipeline_name"],
                    "status": row["status"],
                    "started_at": row["started_at"],
                    "finished_at": row["finished_at"],
                    "log_file_path": row["log_file_path"],
                    "sessions": sessions_by_run.get(row["id"], []),
                }
                for row in run_rows
            ]

            terminal_rows = conn.execute(
                """
                SELECT terminal_id, title, created_at, updated_at, closed_at, log_file_path
                FROM manual_terminals_history
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (terminal_limit,),
            ).fetchall()

            terminals_history: list[dict] = []
            for row in terminal_rows:
                command_rows = conn.execute(
                    """
                    SELECT command
                    FROM manual_terminal_commands
                    WHERE terminal_id = ?
                    ORDER BY id DESC
                    LIMIT 500
                    """,
                    (row["terminal_id"],),
                ).fetchall()
                commands = [item["command"] for item in reversed(command_rows)]
                terminals_history.append(
                    {
                        "terminal_id": row["terminal_id"],
                        "title": row["title"],
                        "created_at": row["created_at"],
                        "updated_at": row["updated_at"],
                        "closed_at": row["closed_at"],
                        "log_file_path": row["log_file_path"],
                        "commands": commands,
                    }
                )

            return {
                "runs": runs,
                "manual_terminal_history": terminals_history,
            }
