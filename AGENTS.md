# AGENTS

## Terminal Work

Для любых задач, связанных с terminal runtime, terminal sessions, queue execution, PTY, shell integration, `command -> terminal`, `sequence -> terminal`, live terminal UI или terminal WebSocket events, сначала нужно прочитать:

- `.agents/terminal-system-spec.md`

Эта спека является рабочим контрактом для терминального функционала.

Правила работы:

- перед анализом, реализацией или review по терминальной системе сначала сверяться со спекой;
- если задача относится к терминальной системе и спека применима, решения должны ей соответствовать;
- если код и спека расходятся, нужно явно указать расхождение;
- если в ходе работы принято новое архитектурное решение по терминальной системе, нужно обновить `.agents/terminal-system-spec.md`;
- при выборе реализации не изобретать велосипед: сначала использовать зрелые готовые библиотеки и framework-level решения, а кастомный код писать только для project-specific orchestration.
