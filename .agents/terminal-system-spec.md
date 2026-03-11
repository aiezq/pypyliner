# Спецификация новой терминальной системы

## Статус

Draft

## Контекст

Текущая терминальная система проекта удалена частично:

- frontend сохраняет окна терминалов и часть graph execution API;
- live runtime терминала отсутствует;
- backend уже умеет выполнять pipeline шаги последовательно, но не поддерживает живую терминальную сессию с общим shell state.

Новая система должна вернуть терминал как основной runtime-элемент графа и при этом остаться максимально нативной для локального shell-окружения.

## Цели

- Реализовать нативный локальный терминал на базе одного shell-сеанса на один terminal node.
- Поддержать очередь команд внутри terminal node:
  `command1 -> command2 -> ... -> terminal`.
- Поддержать последовательный запуск terminal nodes внутри `sequence`.
- Гарантировать, что следующий terminal в `sequence` не стартует, пока предыдущий полностью не завершил свою очередь команд.
- Сохранить совместимость с существующей graph-моделью: `command`, `terminal`, `ssh-terminal`, `sequence`, `variable`.
- Обеспечить live-обновление UI через WebSocket.

## Не-цели первой итерации

- Параллельный запуск terminal nodes внутри одного `sequence`.
- Удалённый orchestration beyond local host.
- Автоматический recovery shell state после падения backend.

## Основные принципы

### 0. Не изобретать велосипед

При проектировании новой терминальной системы приоритет должен быть у готовых, зрелых и поддерживаемых решений.

Правило выбора:

- сначала использовать существующие framework/library/runtime components;
- писать собственную инфраструктуру только там, где готовое решение не покрывает требования проекта;
- не строить вручную то, что уже надёжно решено в ecosystem: PTY integration, terminal rendering, websocket transport helpers, session buffering;
- перед написанием кастомного слоя нужно явно ответить, почему существующее решение не подходит.

Практическое следствие:

- для terminal emulation и PTY нужно сначала смотреть на зрелые библиотеки, а не писать низкоуровневую реализацию с нуля;
- для frontend terminal UI нужно сначала рассматривать готовый terminal renderer;
- кастомной должна быть orchestration-логика, специфичная для graph model проекта: `command -> terminal`, `sequence`, mapping node ids, queue semantics.

### 1. Один terminal = один живой shell process

Каждый terminal node должен исполнять свою очередь команд внутри одного shell-сеанса.
Это обязательно для корректной работы:

- `cd`;
- `export`;
- shell functions;
- временных переменных окружения;
- интерактивного контекста shell.

### 2. Очередь принадлежит backend

Frontend не должен самостоятельно оркестрировать отдельные команды.
Frontend только:

- резолвит graph в execution request;
- отправляет команду на запуск terminal или sequence;
- подписывается на live-события;
- отображает состояние.

Очередность, блокировки, статус и lifecycle должны находиться на backend.

### 3. Sequence оркестрирует terminal jobs, а не отдельные команды

Если `sequence` ссылается на несколько terminal nodes, backend запускает их строго по порядку:

1. terminal A
2. полное завершение очереди terminal A
3. terminal B
4. полное завершение очереди terminal B
5. и так далее

## Пользовательские сценарии

### Сценарий 1. Запуск terminal node

Пользователь запускает terminal node, у которого есть цепочка входящих command nodes.

Ожидание:

- создаётся одна terminal session;
- команды исполняются по очереди;
- вывод отображается в одном окне;
- при успешном завершении terminal получает статус `success`;
- при ошибке команды terminal получает статус `failed`, а очередь прекращается.
- после завершения backend queue local terminal session может остаться живой и открыть interactive stdin в той же `xterm.js`-сессии;
- ввод в такой terminal остаётся заблокированным, пока backend не завершит очередь команд.

### Сценарий 2. Запуск sequence

Пользователь запускает sequence node, к которому подключены несколько terminal nodes.

Ожидание:

- terminal nodes запускаются по порядку `seq-in-0`, `seq-in-1`, ...;
- следующий terminal не создаётся и не стартует, пока предыдущий не завершён;
- ошибка в одном terminal по умолчанию останавливает весь sequence.

### Сценарий 3. Ручная остановка

Пользователь нажимает stop во время выполнения команды.

Ожидание:

- активный процесс получает terminate/kill policy;
- terminal получает статус `stopped`;
- оставшаяся очередь команд не исполняется;
- если terminal был частью sequence, sequence тоже получает статус `stopped`.

### Сценарий 4. Manual terminal

Пользователь создаёт terminal через кнопку `New terminal` и отправляет команды вручную.

Ожидание:

- создаётся backend terminal session, а не только frontend placeholder;
- session держит один живой shell process;
- manual terminal поддерживает нативный ввод прямо в `xterm.js`, без отдельной текстовой строки поверх терминала;
- backend queue API для manual terminal остаётся допустимым fallback/debug surface, но не основным UX;
- shell state сохраняется между ручными командами;
- clear очищает buffer, но не убивает shell;
- stop завершает shell и переводит session в `stopped`.
- close terminal window удаляет session из backend snapshot; если shell ещё жив, backend сначала останавливает его, а затем убирает session.
- для top-level local interactive shell команды `exit` и `logout` не должны завершать backend terminal session; закрытие local terminal делается через UI close/stop actions.
- это ограничение не должно ломать выход из вложенных shell/REPL/container sessions внутри того же terminal, где `exit/logout` должны продолжать работать нормально.
- practically это означает prompt-aware blocking на backend input path, а не blanket override builtin-команд внутри любого вложенного shell.
- после выхода из вложенного local shell/container session host prompt должен быть восстановлен в той же terminal session без ручного redraw со стороны пользователя.

## Архитектура

## Frontend

Frontend отвечает за:

- graph resolution;
- запуск terminal execution request;
- запуск sequence execution request;
- отображение terminal window;
- подписку на WebSocket events;
- синхронизацию store с backend state.

### Frontend модули, которые будут затронуты

- `frontend/src/graph/hooks/useGraphExecution.ts`
- `frontend/src/graph/hooks/useSequenceExecution.ts`
- `frontend/src/graph/utils/graphResolver.ts`
- `frontend/src/hooks/useManualTerminalController.ts`
- `frontend/src/components/TerminalPanel.tsx`
- `frontend/src/components/TerminalEmulator.tsx`
- `frontend/src/graph/store/graphStore.ts`
- `frontend/src/lib/api.ts`

Для первой frontend-итерации допустимо переиспользовать существующий слой `manualTerminals`/floating windows как host UI для backend terminal sessions, если:

- source of truth для runtime state остаётся backend snapshot/events;
- `terminalId` в graph node обновляется backend session id;
- placeholder local windows не оркестрируют backend очередь и не подменяют live session state.

## Backend

Backend должен получить отдельный runtime для terminal sessions.

Рекомендуемый новый модуль:

- `service/src/app/services/terminal_runtime.py`

Он должен быть отделён от текущего pipeline runtime:

- `service/src/app/services/runtime.py`

`runtime.py` уже решает задачу batch pipeline runs.
Новый terminal runtime решает задачу живых terminal sessions и queue orchestration.

Для первой реализации допустима схема с двумя runtime manager'ами:

- существующий `runtime.py` остаётся владельцем batch `runs`;
- новый `terminal_runtime.py` владеет `terminals` и `sequences`;
- WebSocket hub может быть общим, чтобы frontend подписывался на один `/ws/events`;
- snapshot `/api/state` и initial WebSocket snapshot должны агрегировать `runs`, `terminals`, `sequences`.

## Модель выполнения

### TerminalSession

Сущность terminal session должна содержать минимум:

- `id`
- `terminal_node_id`
- `sequence_id | null`
- `title`
- `terminal_type`
- `status`
- `created_at`
- `started_at | null`
- `finished_at | null`
- `exit_code | null`
- `queue`
- `current_command_index | null`
- `current_command_id | null`
- `shell_pid | null`
- `lines`

### TerminalCommand

Очередь terminal должна содержать элементы:

- `id`
- `node_id`
- `label`
- `original_command`
- `resolved_command`
- `status`
- `started_at | null`
- `finished_at | null`
- `exit_code | null`

### SequenceExecution

Sequence execution должна содержать:

- `id`
- `sequence_node_id`
- `status`
- `terminal_jobs`
- `current_terminal_index | null`
- `created_at`
- `started_at | null`
- `finished_at | null`

## Статусы

### Terminal status

- `idle`
- `starting`
- `running`
- `draining`
- `success`
- `failed`
- `stopped`

### Command status

- `pending`
- `running`
- `success`
- `failed`
- `skipped`
- `stopped`

### Sequence status

- `pending`
- `running`
- `success`
- `failed`
- `stopped`

## Транспорт и I/O

## Local terminal

Для локального terminal runtime должен использовать PTY/pseudo-terminal.

Требование:

- один shell process на terminal session;
- чтение stdout/stderr через PTY stream;
- запись команд в stdin shell-процесса;
- корректная остановка shell и дочерних процессов.
- backend может делать quiet bootstrap shell-сессии и нормализовать PTY output для plain-text UI:
  - в `xterm.js`-режиме backend стримит raw terminal output в отдельный terminal websocket;
  - для queue-driven graph execution backend может скрывать служебные marker-команды от browser terminal;
  - для interactive browser terminal backend должен уметь переключать stdin access state без пересоздания session;
  - plain-text line buffer остаётся как secondary history/debug surface, но не как основной renderer.

Примечание:
модель `create_subprocess_shell(command)` на каждую команду не подходит как основа новой терминальной системы, потому что она теряет shell state между командами.

Для POSIX-only первой итерации допустимо использовать стандартные Unix primitives Python (`pty`, `termios`, process groups), если orchestration и event-модель остаются отдельным backend слоем, а не размазываются по frontend.

## SSH terminal

Для первой итерации допустимо:

- либо отложить полноценную живую SSH-сессию;
- либо запустить её как отдельный этап после local terminal.

Если SSH поддерживается в первой итерации, архитектурно он должен выглядеть как тот же terminal session abstraction, но с другим transport layer.

## Graph resolution

Graph resolver должен уметь:

- идти назад от terminal node по chain edges;
- собирать commands в правильном порядке;
- резолвить variables;
- строить `TerminalExecutionRequest`.

Для sequence resolver должен:

- находить все входящие edges типа `sequence`;
- сортировать их по `seq-in-{index}`;
- превращать их в ordered list terminal jobs.

## SSH terminal node

`ssh-terminal` является отдельным terminal node type в graph model и должен поддерживаться в этой же архитектуре исполнения, что и обычный local terminal, но с другим transport layer.

### Роль в графе

SSH terminal node:

- является точкой назначения для цепочки `command -> ... -> ssh-terminal`;
- может быть участником `sequence` на тех же правах, что и local terminal;
- исполняет очередь команд строго последовательно;
- должен запускать все команды внутри одной живой SSH session, если SSH runtime включён.

### Минимальные поля ssh-terminal node

На уровне graph node `ssh-terminal` должен иметь минимум:

- `label`
- `terminalSessionId | null`
- `connectionId | null`
- `sshUsername`
- `sshHost`
- `sshPassword`
- `sshCommand`

Примечание:
текущее frontend-поле `terminalId` допустимо как legacy naming, но целевая модель должна двигаться к имени `terminalSessionId`.

### Источник SSH connection

SSH terminal node может получать connection details двумя способами:

1. Через `connectionId`, который указывает на сохранённую SSH connection в store.
2. Через inline-поля самого node, если явной сохранённой connection нет.

Приоритет рекомендуется такой:

1. `connectionId`
2. inline node fields

Это правило уже частично соответствует текущему graph resolver и должно быть сохранено в новой системе.

### SSH execution model

Если SSH terminal запускается, backend должен воспринимать его как отдельную terminal session с типом `ssh`.

Требования:

- создаётся одна SSH session на один запуск terminal node;
- все команды очереди исполняются в рамках одной удалённой shell session;
- `command1` и `command2` должны разделять общий remote shell state;
- sequence не должен различать local terminal и ssh terminal с точки зрения orchestration semantics.

### SSH transport layer

SSH transport должен быть заменяемым слоем под общей terminal abstraction.

То есть orchestration остаётся общей:

- queueing;
- status transitions;
- stop behavior;
- sequence ordering;
- websocket events;
- session snapshots.

Различаться должен только transport:

- local terminal использует local PTY;
- ssh terminal использует SSH session/SSH channel.

### Важное ограничение

SSH terminal не должен реализовываться как серия независимых вызовов вида `ssh host "<command>"` на каждую команду очереди, потому что в этом случае теряется общий shell state между командами.

Допустимая модель:

- одна живая SSH shell session;
- последовательная отправка команд в эту же session.

### Первая итерация

Для первой итерации допустимы два варианта, и это должно быть выбрано явно в implementation backlog:

1. `ssh-terminal` node существует в графе, но live execution временно недоступен и backend возвращает явную ошибку `not implemented`.
2. `ssh-terminal` node поддерживается сразу, но только через готовую зрелую SSH library/framework, без самописного транспорта с нуля.

Недопустимый вариант:

- делать псевдо-поддержку SSH через отдельный новый процесс на каждую команду.

Текущий выбранный вариант:

- используется вариант `2`;
- backend SSH runtime реализован через `paramiko`;
- на один `ssh-terminal` создаётся один `SSHClient` + один `invoke_shell()` channel;
- queue commands, manual stdin и post-queue interactive mode работают в этой же живой SSH shell session.

Текущие ограничения первой SSH-итерации:

- transport использует `sshHost`, `sshUsername`, `sshPassword` как основной источник подключения;
- `sshCommand` пока остаётся UI/config полем graph node и не является источником transport-опций backend runtime;
- при отсутствии `sshPassword` backend разрешает key/agent auth через `paramiko`;
- host key policy первой итерации: auto-accept (`AutoAddPolicy`) ради рабочего local operator UX.
- если interactive SSH terminal после завершения backend queue получает `exit` или `logout`, backend закрывает remote SSH channel и переводит ту же terminal session в локальный shell, чтобы пользователь возвращался на свою машину, а не в мёртвую session.

### SSH и sequence

Если `sequence` содержит mixed terminals:

- `local terminal`
- `ssh terminal`
- `local terminal`

то они всё равно должны исполняться строго по порядку без параллелизма.

Следующий terminal в sequence не должен стартовать, пока текущий SSH terminal полностью не завершил:

- активную команду;
- всю очередь;
- финальный status transition.

### Ошибки SSH terminal

Ошибки SSH terminal должны укладываться в ту же статусную модель:

- ошибка подключения до старта первой команды переводит terminal в `failed`;
- ошибка во время активной команды переводит текущую команду в `failed`, terminal в `failed`;
- оставшаяся очередь получает `skipped`;
- sequence, если он есть, прекращает выполнение с `failed`.

### UI требования для ssh-terminal

UI должен явно показывать, что terminal является SSH terminal.

Минимально:

- бейдж или label `SSH`;
- `username@host`, если connection details доступны;
- status;
- queue progress;
- live output buffer;
- stop action.

### Acceptance criteria для ssh-terminal

Если граф содержит:

`command1 -> command2 -> ssh-terminal`

то при поддерживаемом SSH runtime:

- создаётся одна SSH terminal session;
- `command1` исполняется раньше `command2`;
- `command2` исполняется в том же remote shell state;
- при ошибке `command1` `command2` не запускается.

## API контракт

Ниже предложен целевой API. Имена могут быть скорректированы, но смысл должен сохраниться.

### HTTP

#### Создание terminal session из graph terminal

`POST /api/terminals/execute`

Payload:

```json
{
  "terminal_node_id": "node-12",
  "title": "Collect Terminal",
  "terminal_type": "local",
  "commands": [
    {
      "node_id": "node-1",
      "label": "Prepare",
      "original_command": "cd ~/repo",
      "resolved_command": "cd ~/repo"
    },
    {
      "node_id": "node-2",
      "label": "Run",
      "original_command": "python app.py",
      "resolved_command": "python app.py"
    }
  ]
}
```

#### Запуск sequence

`POST /api/sequences/execute`

Payload:

```json
{
  "sequence_node_id": "node-30",
  "terminals": [
    {
      "terminal_node_id": "node-12",
      "title": "Collect Terminal",
      "terminal_type": "local",
      "commands": []
    },
    {
      "terminal_node_id": "node-20",
      "title": "Teleop Terminal",
      "terminal_type": "local",
      "commands": []
    }
  ]
}
```

#### Остановка terminal

`POST /api/terminals/{terminal_session_id}/stop`

#### Создание manual terminal

`POST /api/terminals`

#### Добавление команды в существующий terminal

`POST /api/terminals/{terminal_session_id}/commands`

#### Получение terminal snapshot

`GET /api/terminals`

`GET /api/terminals/{terminal_session_id}`

#### Очистка буфера terminal UI

`POST /api/terminals/{terminal_session_id}/clear`

`clear` очищает накопленные lines и UI-состояние, но не должен молча убивать живой shell.

#### Закрытие terminal session

`DELETE /api/terminals/{terminal_session_id}`

`delete` должен убирать session из backend snapshot. Для interactive manual terminal это основной способ закрыть окно без риска, что session вернётся после reconnect/snapshot.

## WebSocket события

Нужно добавить новые event types:

- `terminal_created`
- `terminal_status`
- `terminal_line`
- `terminal_deleted`
- `terminal_command_status`
- `terminal_queue_changed`
- `sequence_created`
- `sequence_status`

Отдельно для полноценного browser terminal допустим отдельный terminal-scoped websocket:

- `GET /ws/terminals/{terminal_session_id}`
- server -> client: `snapshot`, `data`, `reset`
- client -> server: `input`, `resize`

Backend terminal snapshot/event contract должен включать `stdin_enabled`:

- `stdin_enabled=true` означает, что browser terminal может писать в PTY stdin;
- `stdin_enabled=false` означает read-only attach, даже если session остаётся живой;
- для manual terminal `stdin_enabled` обычно `true` сразу после создания session;
- для terminal node execution `stdin_enabled` становится `true` только после завершения backend queue;
- для sequence-owned terminals `stdin_enabled` остаётся `false` на всём lifecycle.

### Минимальный terminal event payload

```json
{
  "terminal_session_id": "term_123",
  "terminal_node_id": "node-12",
  "status": "running",
  "current_command_index": 1,
  "exit_code": null
}
```

## Поведение по ошибкам

### Ошибка команды в terminal

Поведение по умолчанию:

- текущая команда получает `failed`;
- terminal получает `failed`;
- оставшиеся команды получают `skipped`;
- если terminal был частью sequence, sequence получает `failed`;
- следующие terminal jobs в sequence не запускаются.

### Остановка оператором

- текущая команда получает `stopped`;
- terminal получает `stopped`;
- оставшиеся команды получают `skipped` или `stopped` по выбранной модели;
- sequence получает `stopped`.

## Поведение при повторном запуске

Нужно определить единое правило:

- либо terminal node всегда создаёт новую terminal session;
- либо terminal node переиспользует предыдущую idle/success session.

Рекомендуемое правило для первой версии:

- каждый запуск terminal node создаёт новую terminal session;
- UI может сгруппировать истории по `terminal_node_id`, но runtime session должна быть новой.

Это проще, надёжнее и убирает неоднозначность накопленного shell state.

Исключение для manual terminal:

- interactive session, созданная через `POST /api/terminals`, может жить дольше одной команды;
- новые ручные команды добавляются в queue этой же session;
- это исключение не меняет правило, что graph terminal node создаёт новую runtime session на каждый запуск.

## Изменения во frontend store

В store должно появиться состояние, достаточное для отображения live terminal runtime:

- `terminalSessionsById`
- `terminalSessionIdByNodeId`
- `terminalStatuses`
- `terminalCurrentCommandIndexById`
- `sequenceExecutionsById`
- `activeSequenceExecutionIdByNodeId`

Текущее поле `terminalId` в node data можно сохранить как UI/runtime reference, но лучше постепенно переименовать в более точное `terminalSessionId`.

## UI требования

Terminal window должна отображать:

- заголовок terminal;
- тип terminal (`local` / `ssh`);
- статус;
- текущую команду;
- индекс команды в очереди;
- exit code;
- live output buffer;
- stop action;
- clear action;
- признак запуска из sequence.

Минимально допустимый UI для первой итерации:

- `xterm.js` renderer для backend terminal sessions;
- resize-aware terminal viewport;
- live keyboard input для interactive manual terminal прямо в `xterm.js`;
- live keyboard input для terminal node session после завершения backend queue, в той же xterm session;
- read-only attach для backend-owned queue execution и для sequence terminals;
- plain-text fallback допустим только для legacy/local placeholder состояний.

## Нефункциональные требования

- Последовательность исполнения должна быть детерминированной.
- Backend должен быть source of truth для status transitions.
- Поток событий не должен дублировать строки после reconnect.
- Остановка должна быть идемпотентной.
- Один terminal session не должен одновременно исполнять две команды.
- Один sequence execution не должен одновременно запускать два terminal jobs.

## Этапы внедрения

### Этап 1. Backend local terminal runtime

- создать `terminal_runtime.py`;
- реализовать local PTY session;
- реализовать очередь команд внутри одной terminal session;
- реализовать stop/snapshot API;
- добавить websocket events.

### Этап 2. Frontend live terminal integration

- вернуть `useGraphExecution`;
- подключить terminal execution API;
- синхронизировать live state через WebSocket;
- заменить placeholder в `TerminalPanel`.

### Этап 3. Sequence orchestration

- реализовать backend sequence execution manager;
- обеспечить строгий serial запуск terminal jobs;
- обновить frontend sequence execution flow.

### Этап 4. SSH support

- определить transport abstraction;
- добавить SSH terminal execution;
- синхронизировать UI и graph execution.

## Критерии приёмки

### AC-1. Очередь команд terminal

Если граф содержит:

`command1 -> command2 -> terminal`

то при запуске terminal:

- создаётся один terminal session;
- `command1` исполняется раньше `command2`;
- `command2` стартует только после завершения `command1`;
- обе команды исполняются в одном shell state.

### AC-2. Sequence терминалов

Если graph sequence содержит:

`terminalA -> sequence`
`terminalB -> sequence`

то:

- `terminalA` исполняется раньше `terminalB`, если подключён к `seq-in-0`;
- `terminalB` не стартует до полного завершения `terminalA`.

### AC-3. Ошибка внутри terminal

Если первая команда завершилась с ошибкой:

- terminal получает `failed`;
- оставшиеся команды не исполняются;
- sequence, если он есть, не продолжает выполнение.

### AC-4. Stop

Если оператор нажал stop:

- активная команда прерывается;
- terminal получает `stopped`;
- sequence прекращается.

### AC-5. Live UI

Frontend должен в реальном времени показывать:

- появление terminal session;
- смену статусов;
- новые строки output;
- завершение команды;
- завершение terminal/session.

## Открытые вопросы

- Нужна ли в первой версии полноценная поддержка ANSI/цветов?
- Нужно ли сохранять terminal sessions в историю БД отдельно от pipeline runs?
- Нужно ли разрешать политику `continue-on-error` для sequence или terminal queue?
- Какой exact UX ожидается для повторного запуска terminal node из уже открытого окна?

## Рекомендуемое следующее действие

Следующим документом стоит сделать implementation backlog:

- новые backend schemas;
- новые API routes;
- структура `terminal_runtime.py`;
- изменения frontend hooks/store/components;
- список тестов по слоям.
