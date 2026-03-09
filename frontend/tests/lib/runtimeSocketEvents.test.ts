import { describe, expect, it, vi } from 'vitest'
import { applyRuntimeSocketEvent } from '../../src/lib/runtimeSocketEvents'
import type { ManualTerminal } from '../../src/types'

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
          manual_terminals: [
            {
              id: 'terminal_1',
              title: 'Terminal #1',
              is_sequence: false,
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
    expect(state.manualTerminals).toHaveLength(1)
    expect(state.context.manualCommandHistoryRef.current.terminal_1?.entries).toEqual(['pwd'])
    expect(state.context.pruneAndPersistStoredHistory).toHaveBeenCalled()
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
            is_sequence: false,
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

  it('handles updates for terminals and ignores unknown events', () => {
    const state = createContext()

    applyRuntimeSocketEvent(
      {
        type: 'terminal_updated',
        data: {
          terminal: {
            id: 'terminal_2',
            title: 'Terminal #2',
            is_sequence: false,
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
