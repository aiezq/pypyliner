# Pypyliner Operator Helper

Pypyliner Operator Helper — локальное desktop-приложение для Linux-операторов.
Оно объединяет визуальный запуск пайплайнов, интерактивные терминальные окна и постоянную историю запусков.

- Фронтенд: React 19 + TypeScript + Vite
- Бэкенд: FastAPI + runtime на asyncio subprocess
- Хранение данных: JSON-файлы (паки/флоу) + SQLite (история)

Важно:
- модель single-host (все работает на одной машине);
- нет auth/RBAC (только доверенная локальная среда);
- команды выполняются на хосте, где запущен бэкенд.

## Текущая функциональность

### Фронтенд

- Workbench с перетаскиваемыми и сворачиваемыми панелями (`Pipeline Flow`, `Pipeline Dock`, `Terminal Instances`).
- Лента pipeline flow с горизонтальным DnD-переупорядочиванием (`@hello-pangea/dnd`).
- Inline-редактирование шагов флоу и подготовленных команд.
- Импорт и управление JSON command packs из интерфейса.
- Сохранение pipeline workflow с переключением, переименованием и удалением через `Workflow settings`.
- Плавающие терминальные окна с pin/unpin в workbench.
- Возможности терминала:
  - отправка команды по `Enter`;
  - история команд стрелками;
  - автодополнение по `Tab` с циклическим перебором совпадений;
  - копирование последних `N` строк вывода.
- Вкладка истории (данные приходят из базы бэкенда).
- Синхронизация runtime в реальном времени по WebSocket.

### Бэкенд

- Модульные FastAPI-роуты (`/api/*` + `/ws/events`).
- Runtime-менеджер для последовательного выполнения pipeline и ручных терминалов.
- Управление command packs (`service/command_packs/*.json`).
- Управление pipeline flows (`service/pipeline_flows/*.json`).
- SQLite-персистентность запусков и истории терминалов (`service/data/history.sqlite3`).
- Модели SQLModel + автозапуск Alembic-миграций при старте.
- Инициализация структурированного логирования и централизованных настроек (`pydantic-settings`).

## Структура проекта

```text
operator_helper/
  frontend/
    src/
      components/
      features/
      hooks/
      lib/
      stores/
  service/
    src/app/
      api/routes/
      core/
      models/
      schemas/
      services/
    command_packs/
    pipeline_flows/
    data/
    logs/
    alembic/
```

## Требования

- Linux/macOS shell-окружение
- Python 3.11+
- Node.js >= 20.19 (или >= 22.12)
- `pnpm` или `npm`

## Запуск приложения

### Одной командой

Из корня репозитория:

```bash
make dev
```

С кастомными портами и хостами:

```bash
make dev -- --backend-port 9000 --frontend-port 5174 --backend-host 0.0.0.0 --frontend-host 0.0.0.0
```

Поддерживаемые флаги `scripts/dev.sh`:
- `--backend-port <port>`
- `--frontend-port <port>`
- `--backend-host <host>`
- `--frontend-host <host>`
- `--api-base-url <url>`
- `--setup-only`
- `--skip-setup`

Полезные команды:

```bash
make setup     # только установка зависимостей
make update    # git pull --rebase + очистка локальных frontend-артефактов/кэша
```

`make dev` автоматически проверяет Node.js и может локально установить Node в
`$HOME/.local/operator-helper/node`, если системный Node отсутствует или устарел.

### Ручной запуск

Бэкенд:

```bash
cd service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

Фронтенд:

```bash
cd frontend
pnpm install
pnpm dev
```

Документация API: `http://localhost:8000/docs`

## Конфигурация

### Переменные окружения фронтенда

- `VITE_API_BASE_URL` (по умолчанию вычисляется из host/port бэкенда).

### Переменные окружения бэкенда (префикс `OPERATOR_`)

Примеры:
- `OPERATOR_DATABASE_URL`
- `OPERATOR_LOGS_DIR`
- `OPERATOR_DATA_DIR`
- `OPERATOR_COMMAND_PACKS_DIR`
- `OPERATOR_PIPELINE_FLOWS_DIR`

Полный список и значения по умолчанию смотрите в `service/src/app/core/settings.py`.

## Хранение данных и логи

- Логи запусков pipeline: `service/logs/runs/run_<id>.log`
- Логи терминалов: `service/logs/terminals/terminal_<id>.log`
- БД истории: `service/data/history.sqlite3`
- Наборы команд: `service/command_packs/*.json`
- Pipeline flow: `service/pipeline_flows/*.json`

## Обзор API

Базовый URL: `http://localhost:8000`

- Состояние и история:
  - `GET /health`
  - `GET /api/state`
  - `GET /api/history`
- Запуски (Runs):
  - `GET /api/runs`
  - `GET /api/runs/{run_id}`
  - `POST /api/runs`
  - `POST /api/runs/{run_id}/stop`
  - `GET /api/runs/{run_id}/log`
- Терминалы (Terminals):
  - `GET /api/terminals`
  - `POST /api/terminals`
  - `POST /api/terminals/{terminal_id}/run`
  - `POST /api/terminals/{terminal_id}/complete`
  - `PATCH /api/terminals/{terminal_id}`
  - `POST /api/terminals/{terminal_id}/stop`
  - `POST /api/terminals/{terminal_id}/clear`
  - `DELETE /api/terminals/{terminal_id}`
  - `GET /api/terminals/{terminal_id}/log`
- Наборы команд (Command packs):
  - `GET /api/command-packs`
  - `POST /api/command-packs/templates`
  - `PATCH /api/command-packs/templates/{template_id}`
  - `DELETE /api/command-packs/templates/{template_id}`
  - `POST /api/command-packs/templates/{template_id}/move`
  - `POST /api/command-packs/import`
- Pipeline flow:
  - `GET /api/pipeline-flows`
  - `POST /api/pipeline-flows`
  - `PUT /api/pipeline-flows/{flow_id}`
  - `DELETE /api/pipeline-flows/{flow_id}`
- WebSocket:
  - `WS /ws/events`

Специальная команда:
- `operator:create_terminal` перехватывается бэкендом и создает ручной терминал вместо выполнения shell-команды как текста.

## Тесты и покрытие

### Фронтенд

Команда:

```bash
cd frontend
npm run coverage
```

Последний локальный результат (2026-03-05):
- файлов с тестами: `37 passed`
- тестов: `167 passed`
- покрытие:
  - statements (инструкции): `96.60%`
  - branches (ветвления): `84.11%`
  - functions (функции): `99.42%`
  - lines (строки): `96.48%`

### Сервис

Команда:

```bash
cd service
source .venv/bin/activate
pytest --cov=src/app --cov-report=term-missing
```

Последний локальный результат (2026-03-05):
- тестов: `51 passed`
- общее покрытие: `90%` (`1844` statements, `176` missed)

## Безопасность

- По дизайну отсутствуют auth и sandbox для команд.
- Не открывайте сервис в недоверенные сети.
- Используйте только в доверенной локальной/внутренней среде.

## Решение проблем

### Фронтенд падает из-за версии Node.js

Vite требует Node `>=20.19` или `>=22.12`.
Запустите `make dev` (авто-bootstrap) или установите более новую Node вручную.

### Ошибка импорта в бэкенде (`No module named 'app'`)

Запускайте бэкенд из `service/` и используйте:

```bash
uvicorn src.main:app --reload
```

### Пустая история

- выполните хотя бы один pipeline или команду в ручном терминале;
- проверьте, что существует `service/data/history.sqlite3`;
- проверьте права на запись в `service/data` и `service/logs`.
