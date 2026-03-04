# Operator Helper

Local desktop-style app for Linux operators:
- build and run command pipelines;
- open interactive terminal instances in UI;
- keep logs and history on local machine.

Stack:
- Frontend: React + TypeScript + Vite
- Backend: FastAPI + asyncio subprocesses
- Storage: JSON files + SQLite

Important:
- this project is intentionally local-first;
- no auth is implemented;
- all commands run on the same host where backend is running.

## What it does

- Pipeline Flow:
  - create/edit/delete steps directly in flow ribbon;
  - reorder steps with drag-and-drop;
  - run sequentially;
  - save and switch between named flows;
  - manage saved flows in `Workflow settings` (rename/delete/open).
- Command Packs (DLC-like JSON packs):
  - core prepared commands;
  - custom packs;
  - import from UI (`Import JSON DLC`) or by dropping JSON files into folder.
- Manual terminals:
  - create separate terminal windows;
  - pin/unpin into main workbench;
  - rename, stop, clear, close;
  - send on `Enter`;
  - command history with `ArrowUp/ArrowDown`;
  - path completion on `Tab` (including cycling matches);
  - copy last `N` lines from terminal output.
- History tab:
  - pipeline runs and terminal command history loaded from SQLite.
- Real-time updates:
  - WebSocket events for run/session/terminal updates.

## Project structure

```text
operator_helper/
  frontend/                    # React app
  service/                     # FastAPI service
    command_packs/             # JSON command packs
    pipeline_flows/            # Saved pipeline flows (JSON)
    logs/
      runs/                    # Pipeline run logs
      terminals/               # Manual terminal logs
    data/
      history.sqlite3          # History DB
```

## Requirements

- Linux/macOS shell environment
- Python 3.11+
- Node.js 20+ (recommended)
- pnpm or npm

## Quick start

### One command (recommended)

From repository root:

```bash
make dev
```

With custom ports/flags:

```bash
make dev -- --backend-port 9000 --frontend-port 5174
```

Useful flags:
- `--backend-port <port>`
- `--frontend-port <port>`
- `--backend-host <host>`
- `--frontend-host <host>`
- `--api-base-url <url>`
- `--skip-setup`

`make dev` now checks Node.js toolchain automatically.
If `node` is missing or too old, `scripts/dev.sh` first tries local user-level install of
Node.js (`$HOME/.local/operator-helper/node`) from official Node tarball, without
`apt-get update`.
On Linux, system package manager install is used only as fallback if tarball install fails.

One-time dependency setup only:

```bash
make setup
```

Quick git update:

```bash
make update
```

`make update` also cleans local frontend artifacts before pull:
- `frontend/node_modules`
- `frontend/dist`
- `frontend/.vite`
- `frontend/package-lock.json` (if exists)

Direct runner help:

```bash
./scripts/dev.sh --help
```

### 1) Backend

```bash
cd service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

API will be available at:
- `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`

### 2) Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

If you use npm:

```bash
npm install
npm run dev
```

Frontend defaults to backend URL `http://localhost:8000`.

## Frontend environment

Optional:

- `VITE_API_BASE_URL` - backend base URL.

Example:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000 pnpm dev
```

## Data, logs, and persistence

All persistent files are in `service/`:

- Run logs: `service/logs/runs/run_<id>.log`
- Terminal logs: `service/logs/terminals/terminal_<id>.log`
- History DB: `service/data/history.sqlite3`
- Command packs: `service/command_packs/*.json`
- Pipeline flows: `service/pipeline_flows/*.json`

`service/.gitignore` already ignores `logs/*` and `data/*`.

## Command pack format (JSON)

Place file in `service/command_packs/` or import from UI.

Example:

```json
{
  "pack_id": "ops_pack",
  "pack_name": "Ops Pack",
  "description": "Reusable operator commands",
  "commands": [
    {
      "id": "open_terminal",
      "name": "Open terminal shell",
      "command": "operator:create_terminal",
      "description": "Create interactive terminal in app"
    },
    {
      "name": "Check disk",
      "command": "df -h",
      "description": "Disk usage report"
    }
  ]
}
```

Notes:
- `id` for a command is optional; backend generates/normalizes it.
- Core pack is `pack_id: "core"`.

## Pipeline flow format (JSON)

Saved flows are written to `service/pipeline_flows/*.json`.

Example:

```json
{
  "flow_id": "release_check",
  "flow_name": "Release Check",
  "created_at": "2026-03-04T10:00:00Z",
  "updated_at": "2026-03-04T10:05:00Z",
  "steps": [
    { "type": "template", "label": "Open terminal shell", "command": "operator:create_terminal" },
    { "type": "custom", "label": "Pull repo", "command": "git pull --rebase" }
  ]
}
```

## API overview

Base URL: `http://localhost:8000`

- `GET /health` - service status
- `GET /api/state` - runtime snapshot
- `GET /api/history` - run/terminal history from SQLite

Runs:
- `GET /api/runs`
- `GET /api/runs/{run_id}`
- `POST /api/runs` (create sequential run)
- `POST /api/runs/{run_id}/stop`
- `GET /api/runs/{run_id}/log`

Manual terminals:
- `GET /api/terminals`
- `POST /api/terminals`
- `POST /api/terminals/{terminal_id}/run`
- `POST /api/terminals/{terminal_id}/complete`
- `PATCH /api/terminals/{terminal_id}`
- `POST /api/terminals/{terminal_id}/stop`
- `POST /api/terminals/{terminal_id}/clear`
- `DELETE /api/terminals/{terminal_id}`
- `GET /api/terminals/{terminal_id}/log`

Command packs:
- `GET /api/command-packs`
- `POST /api/command-packs/templates`
- `PATCH /api/command-packs/templates/{template_id}`
- `DELETE /api/command-packs/templates/{template_id}`
- `POST /api/command-packs/templates/{template_id}/move`
- `POST /api/command-packs/import`

Pipeline flows:
- `GET /api/pipeline-flows`
- `POST /api/pipeline-flows`
- `PUT /api/pipeline-flows/{flow_id}`
- `DELETE /api/pipeline-flows/{flow_id}`

WebSocket:
- `WS /ws/events`

## Special pipeline command

`operator:create_terminal` is intercepted by backend as a special pipeline step.
It does not run in shell; it creates an interactive manual terminal instance in the app.

## Safety notes

- No auth, no RBAC, no sandbox for command execution.
- Commands run via backend shell on local host.
- Use only in trusted local environment.
- Do not expose backend port to untrusted network.

## Troubleshooting

### `ModuleNotFoundError: No module named 'app'`

Run backend from `service/` directory with:

```bash
uvicorn src.main:app --reload
```

### Frontend cannot connect to API

- ensure backend is running on port `8000`;
- check `VITE_API_BASE_URL`;
- open browser devtools and verify calls to `/api/*`.

### History is empty

- run at least one pipeline/manual command;
- check that `service/data/history.sqlite3` exists;
- ensure backend has write permissions for `service/data` and `service/logs`.
