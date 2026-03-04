import { describe, expect, it, vi } from 'vitest'
import { applyRuntimeSocketEvent } from '../../src/lib/runtimeSocketEvents'
import type { ManualTerminal, RunState } from '../../src/types'

interface TerminalHistory {
  entries: string[]
  pointer: number
  scratch: string
}

interface CompletionCycle {
  baseCommand: string
  nextIndex: number
  lastAppliedCommand: string
}

const createContext = () => {
  let run: RunState | null = null
  let manualTerminals: ManualTerminal[] = []
  let copyTailLineCountsByTerminalId: Record<string, number> = {}
  let copyTailCopiedByTerminalId: Record<string, boolean> = {}

  const manualCommandHistoryRef = {
    current: {} as Record<string, TerminalHistory>,
  }
  const storedManualHistoryRef = {
    current: {} as Record<string, string[]>,
  }
  const manualCompletionCycleRef = {
    current: {} as Record<string, CompletionCycle>,
  }
  const copyTailResetTimeoutByTerminalIdRef = {
    current: {} as Record<string, number>,
  }

  const setRun = (
    updater: RunState | null | ((prev: RunState | null) => RunState | null),
  ) => {
    run = typeof updater === 'function' ? updater(run) : updater
  }

  const setManualTerminals = (
    updater:
      | ManualTerminal[]
      | ((prev: ManualTerminal[]) => ManualTerminal[]),
  ) => {
    manualTerminals =
      typeof updater === 'function' ? updater(manualTerminals) : updater
  }

  const setCopyTailLineCountsByTerminalId = (
    updater:
      | Record<string, number>
      | ((prev: Record<string, number>) => Record<string, number>),
  ) => {
    copyTailLineCountsByTerminalId =
      typeof updater === 'function'
        ? updater(copyTailLineCountsByTerminalId)
        : updater
  }

  const setCopyTailCopiedByTerminalId = (
    updater:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => {
    copyTailCopiedByTerminalId =
      typeof updater === 'function'
        ? updater(copyTailCopiedByTerminalId)
        : updater
  }

  const pruneAndPersistStoredHistory = vi.fn()

  return {
    get run() {
      return run
    },
    get manualTerminals() {
      return manualTerminals
    },
    get copyTailLineCountsByTerminalId() {
      return copyTailLineCountsByTerminalId
    },
    get copyTailCopiedByTerminalId() {
      return copyTailCopiedByTerminalId
    },
    context: {
      setRun,
      setManualTerminals,
      manualCommandHistoryRef,
      storedManualHistoryRef,
      manualCompletionCycleRef,
      setCopyTailLineCountsByTerminalId,
      setCopyTailCopiedByTerminalId,
      copyTailResetTimeoutByTerminalIdRef,
      pruneAndPersistStoredHistory,
    },
  }
}

describe('applyRuntimeSocketEvent', () => {
  it('applies snapshot and initializes run/manual terminal states', () => {
    const state = createContext()
    state.context.storedManualHistoryRef.current = {
      terminal_1: ['pwd'],
    }

    applyRuntimeSocketEvent(
      {
        type: 'snapshot',
        data: {
          runs: [
            {
              id: 'run_old',
              pipeline_name: 'Old',
              status: 'success',
              started_at: '2026-03-01T09:00:00Z',
              finished_at: '2026-03-01T09:01:00Z',
              log_file_path: '/tmp/old.log',
              sessions: [],
            },
            {
              id: 'run_latest',
              pipeline_name: 'Latest',
              status: 'running',
              started_at: '2026-03-01T10:00:00Z',
              finished_at: null,
              log_file_path: '/tmp/latest.log',
              sessions: [],
            },
          ],
          manual_terminals: [
            {
              id: 'terminal_1',
              title: 'Terminal #1',
              prompt_user: 'operator',
              prompt_cwd: '~',
              status: 'running',
              exit_code: null,
              draft_command: 'ls',
              lines: [],
            },
          ],
        },
      },
      state.context,
    )

    expect(state.run?.id).toBe('run_latest')
    expect(state.manualTerminals).toHaveLength(1)
    expect(state.context.manualCommandHistoryRef.current.terminal_1?.entries).toEqual(['pwd'])
    expect(state.context.pruneAndPersistStoredHistory).toHaveBeenCalled()
  })

  it('applies run/session updates and appended lines', () => {
    const state = createContext()
    applyRuntimeSocketEvent(
      {
        type: 'run_created',
        data: {
          run: {
            id: 'run_1',
            pipeline_name: 'Main flow',
            status: 'running',
            started_at: '2026-03-01T10:00:00Z',
            finished_at: null,
            log_file_path: '/tmp/run.log',
            sessions: [
              {
                id: 'session_1',
                step_id: 'step_1',
                title: 'Step 1',
                command: 'echo 1',
                status: 'running',
                exit_code: null,
                lines: [],
              },
            ],
          },
        },
      },
      state.context,
    )

    applyRuntimeSocketEvent(
      {
        type: 'run_status',
        data: {
          run_id: 'run_1',
          status: 'success',
          finished_at: '2026-03-01T10:01:00Z',
        },
      },
      state.context,
    )
    expect(state.run?.status).toBe('success')

    applyRuntimeSocketEvent(
      {
        type: 'run_session_status',
        data: {
          run_id: 'run_1',
          session_id: 'session_1',
          status: 'failed',
          exit_code: 2,
        },
      },
      state.context,
    )
    expect(state.run?.sessions[0]?.status).toBe('failed')
    expect(state.run?.sessions[0]?.exitCode).toBe(2)

    applyRuntimeSocketEvent(
      {
        type: 'run_session_line',
        data: {
          run_id: 'run_1',
          session_id: 'session_1',
          line: {
            id: 'line_1',
            stream: 'out',
            text: 'done',
            created_at: '2026-03-01T10:00:30Z',
          },
        },
      },
      state.context,
    )
    expect(state.run?.sessions[0]?.lines).toHaveLength(1)
  })

  it('applies manual terminal lifecycle events', () => {
    const state = createContext()
    state.context.copyTailResetTimeoutByTerminalIdRef.current = {
      terminal_1: window.setTimeout(() => undefined, 1000),
    }

    applyRuntimeSocketEvent(
      {
        type: 'terminal_created',
        data: {
          terminal: {
            id: 'terminal_1',
            title: 'Terminal #1',
            prompt_user: 'operator',
            prompt_cwd: '~',
            status: 'running',
            exit_code: null,
            draft_command: 'pwd',
            lines: [],
          },
        },
      },
      state.context,
    )
    expect(state.manualTerminals).toHaveLength(1)
    expect(state.context.manualCommandHistoryRef.current.terminal_1).toBeDefined()

    applyRuntimeSocketEvent(
      {
        type: 'terminal_status',
        data: {
          terminal_id: 'terminal_1',
          status: 'stopped',
          exit_code: 130,
        },
      },
      state.context,
    )
    expect(state.manualTerminals[0]?.status).toBe('stopped')

    applyRuntimeSocketEvent(
      {
        type: 'terminal_line',
        data: {
          terminal_id: 'terminal_1',
          line: {
            id: 'line_1',
            stream: 'out',
            text: 'hello',
            created_at: '2026-03-01T10:00:10Z',
          },
        },
      },
      state.context,
    )
    expect(state.manualTerminals[0]?.lines).toHaveLength(1)

    applyRuntimeSocketEvent(
      {
        type: 'terminal_closed',
        data: { terminal_id: 'terminal_1' },
      },
      state.context,
    )
    expect(state.manualTerminals).toHaveLength(0)
    expect(state.context.manualCommandHistoryRef.current.terminal_1).toBeUndefined()
    expect(state.context.manualCompletionCycleRef.current.terminal_1).toBeUndefined()
    expect(state.context.pruneAndPersistStoredHistory).toHaveBeenCalled()
  })

  it('handles no-op branches for mismatched ids, updates terminal and ignores unknown events', () => {
    const state = createContext()

    applyRuntimeSocketEvent(
      {
        type: 'run_created',
        data: {
          run: {
            id: 'run_1',
            pipeline_name: 'Main flow',
            status: 'running',
            started_at: '2026-03-01T10:00:00Z',
            finished_at: null,
            log_file_path: '/tmp/run.log',
            sessions: [],
          },
        },
      },
      state.context,
    )

    const beforeRun = state.run
    applyRuntimeSocketEvent(
      {
        type: 'run_status',
        data: {
          run_id: 'another_run',
          status: 'failed',
          finished_at: '2026-03-01T10:10:00Z',
        },
      },
      state.context,
    )
    applyRuntimeSocketEvent(
      {
        type: 'run_session_status',
        data: {
          run_id: 'another_run',
          session_id: 's1',
          status: 'failed',
          exit_code: 1,
        },
      },
      state.context,
    )
    applyRuntimeSocketEvent(
      {
        type: 'run_session_line',
        data: {
          run_id: 'another_run',
          session_id: 's1',
          line: {
            id: 'line_ignored',
            stream: 'out',
            text: 'ignored',
            created_at: '2026-03-01T10:00:10Z',
          },
        },
      },
      state.context,
    )
    expect(state.run).toBe(beforeRun)

    applyRuntimeSocketEvent(
      {
        type: 'terminal_updated',
        data: {
          terminal: {
            id: 'terminal_2',
            title: 'Terminal #2',
            prompt_user: 'operator',
            prompt_cwd: '~',
            status: 'running',
            exit_code: null,
            draft_command: 'pwd',
            lines: [],
          },
        },
      },
      state.context,
    )
    expect(state.manualTerminals[0]?.id).toBe('terminal_2')

    applyRuntimeSocketEvent(
      {
        // coverage for default branch
        type: 'unknown_event',
        data: {},
      } as never,
      state.context,
    )
  })
})
