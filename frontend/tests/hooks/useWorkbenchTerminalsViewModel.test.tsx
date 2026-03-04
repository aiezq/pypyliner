import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useWorkbenchTerminalsViewModel } from '../../src/hooks/useWorkbenchTerminalsViewModel'
import type { ManualTerminal, RunState } from '../../src/types'

const makeManual = (id: string, overrides: Partial<ManualTerminal> = {}): ManualTerminal => ({
  id,
  title: `Manual ${id}`,
  titleDraft: `Manual ${id}`,
  promptUser: 'operator',
  promptCwd: '~',
  status: 'idle',
  exitCode: null,
  draftCommand: '',
  lines: [],
  ...overrides,
})

const makeRun = (): RunState => ({
  id: 'run_1',
  pipelineName: 'Main',
  status: 'running',
  startedAt: '2026-03-01T10:00:00Z',
  finishedAt: null,
  logFilePath: '/tmp/run.log',
  sessions: [
    {
      id: 'session_open_terminal',
      stepId: 'step_open',
      title: 'Open terminal',
      command: 'operator:create_terminal',
      status: 'success',
      exitCode: 0,
      lines: [],
    },
    {
      id: 'session_regular',
      stepId: 'step_regular',
      title: 'Regular step',
      command: 'echo hello',
      status: 'running',
      exitCode: null,
      lines: [],
    },
  ],
})

describe('useWorkbenchTerminalsViewModel', () => {
  it('builds terminal windows and filters synthetic open-terminal sessions', async () => {
    const setRequestedMinimizedTerminalWindowIds = vi.fn((updater) =>
      updater(['run:session_regular']),
    )
    const updateManualTitle = vi.fn()
    const renameManualTerminal = vi.fn(async () => {})

    const { result } = renderHook(() =>
      useWorkbenchTerminalsViewModel({
        run: makeRun(),
        manualTerminals: [makeManual('1')],
        pinnedTerminalWindowIds: ['manual:1', 'run:missing'],
        requestedMinimizedTerminalWindowIds: ['run:session_regular', 'run:missing'],
        setRequestedMinimizedTerminalWindowIds,
        updateManualTitle,
        renameManualTerminal,
      }),
    )

    expect(result.current.visibleRunSessions).toHaveLength(1)
    expect(result.current.visibleRunSessions[0]?.id).toBe('session_regular')
    expect(result.current.terminalWindowItems).toHaveLength(2)
    expect(result.current.availableTerminalWindowIds.has('manual:1')).toBe(true)
    expect(result.current.availableTerminalWindowIds.has('run:session_regular')).toBe(true)
    expect(result.current.effectivePinnedTerminalWindowIds).toEqual(['manual:1'])
    expect(result.current.effectiveRequestedMinimizedTerminalWindowIds).toEqual([
      'run:session_regular',
    ])
    expect(result.current.pinnedTerminalPanelKeys).toEqual(['terminal:manual:1'])
    expect(result.current.terminalInstancesCount).toBe(2)

    act(() => {
      result.current.requestMinimizeTerminalWindow('manual:1')
      result.current.consumeRequestedMinimizeTerminalWindow('run:session_regular')
    })
    expect(setRequestedMinimizedTerminalWindowIds).toHaveBeenCalledTimes(2)

    act(() => {
      result.current.startPinnedTerminalTitleEdit(makeManual('1'))
      result.current.cancelPinnedTerminalTitleEdit(makeManual('1'))
    })
    expect(updateManualTitle).toHaveBeenCalledWith('1', 'Manual 1')

    await act(async () => {
      await result.current.savePinnedTerminalTitleEdit(makeManual('1'))
    })
    expect(renameManualTerminal).toHaveBeenCalledWith('1')
    expect(result.current.editingPinnedTerminalTitleId).toBeNull()
  })

  it('avoids duplicate minimize requests', () => {
    const setRequestedMinimizedTerminalWindowIds = vi.fn((updater) =>
      updater(['manual:1']),
    )
    const { result } = renderHook(() =>
      useWorkbenchTerminalsViewModel({
        run: null,
        manualTerminals: [makeManual('1')],
        pinnedTerminalWindowIds: [],
        requestedMinimizedTerminalWindowIds: ['manual:1'],
        setRequestedMinimizedTerminalWindowIds,
        updateManualTitle: vi.fn(),
        renameManualTerminal: vi.fn(async () => {}),
      }),
    )

    act(() => {
      result.current.requestMinimizeTerminalWindow('manual:1')
    })

    expect(setRequestedMinimizedTerminalWindowIds).toHaveBeenCalledWith(expect.any(Function))
    const updater = setRequestedMinimizedTerminalWindowIds.mock.calls[0]?.[0] as (
      prev: string[],
    ) => string[]
    expect(updater(['manual:1'])).toEqual(['manual:1'])
  })
})
