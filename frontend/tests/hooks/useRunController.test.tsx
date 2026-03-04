import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RuntimeSocketEvent } from '../../src/lib/schemas'

const apiRequestMock = vi.hoisted(() => vi.fn())
const applyRuntimeSocketEventMock = vi.hoisted(() => vi.fn())
const useRuntimeSocketMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/api', () => ({
  apiRequest: apiRequestMock,
}))

vi.mock('../../src/lib/runtimeSocketEvents', () => ({
  applyRuntimeSocketEvent: applyRuntimeSocketEventMock,
}))

vi.mock('../../src/hooks/useRuntimeSocket', () => ({
  useRuntimeSocket: useRuntimeSocketMock,
}))

import { useRunController } from '../../src/hooks/useRunController'

describe('useRunController', () => {
  it('wires runtime socket callbacks and applies socket events', async () => {
    let options:
      | {
          onEvent: (event: RuntimeSocketEvent) => void
          onOpen?: () => void | Promise<void>
          onOpenError?: (error: unknown) => void
          onErrorMessage?: (message: string) => void
        }
      | undefined

    useRuntimeSocketMock.mockImplementation((nextOptions) => {
      options = nextOptions
      return { isSocketConnected: true }
    })

    const setBackendError = vi.fn()
    const getSocketEventContext = vi.fn(() => ({
      setManualTerminals: vi.fn(),
      manualCommandHistoryRef: { current: {} },
      storedManualHistoryRef: { current: {} },
      manualCompletionCycleRef: { current: {} },
      setCopyTailLineCountsByTerminalId: vi.fn(),
      setCopyTailCopiedByTerminalId: vi.fn(),
      copyTailResetTimeoutByTerminalIdRef: { current: {} },
      pruneAndPersistStoredHistory: vi.fn(),
    }))

    const reloadCommandPacks = vi.fn(async () => {})
    const reloadPipelineFlows = vi.fn(async () => {})

    const { result } = renderHook(() =>
      useRunController({
        pipelineName: 'Main flow',
        steps: [{ id: 'step_1', type: 'template', label: 'Step', command: 'echo 1' }],
        setBackendError,
        getSocketEventContext,
        reloadCommandPacks,
        reloadPipelineFlows,
      }),
    )

    expect(result.current.isSocketConnected).toBe(true)
    expect(useRuntimeSocketMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await options?.onOpen?.()
    })
    expect(reloadCommandPacks).toHaveBeenCalledTimes(1)
    expect(reloadPipelineFlows).toHaveBeenCalledTimes(1)
    expect(setBackendError).toHaveBeenCalledWith(null)

    act(() => {
      options?.onErrorMessage?.('socket warning')
    })
    expect(setBackendError).toHaveBeenCalledWith('socket warning')

    act(() => {
      options?.onOpenError?.(new Error('open failed'))
    })
    expect(setBackendError).toHaveBeenCalledWith('open failed')

    act(() => {
      options?.onEvent({
        type: 'terminal_closed',
        data: { terminal_id: 'terminal_1' },
      })
    })
    expect(applyRuntimeSocketEventMock).toHaveBeenCalled()
  })

  it('executes and stops pipeline, handles errors and guards', async () => {
    useRuntimeSocketMock.mockReturnValue({ isSocketConnected: false })

    const createdRun = {
      id: 'run_1',
      pipeline_name: 'Main flow',
      status: 'running',
      started_at: '2026-03-01T10:00:00Z',
      finished_at: null,
      log_file_path: '/tmp/run.log',
      sessions: [],
    }
    const stoppedRun = {
      ...createdRun,
      status: 'stopped',
    }

    apiRequestMock
      .mockResolvedValueOnce(createdRun)
      .mockResolvedValueOnce(stoppedRun)
      .mockRejectedValueOnce(new Error('run failed'))

    const setBackendError = vi.fn()
    const { result, rerender } = renderHook(
      ({
        steps,
      }: {
        steps: Array<{ id: string; type: 'template' | 'custom'; label: string; command: string }>
      }) =>
        useRunController({
          pipelineName: 'Main flow',
          steps,
          setBackendError,
          getSocketEventContext: () => ({
            setManualTerminals: vi.fn(),
            manualCommandHistoryRef: { current: {} },
            storedManualHistoryRef: { current: {} },
            manualCompletionCycleRef: { current: {} },
            setCopyTailLineCountsByTerminalId: vi.fn(),
            setCopyTailCopiedByTerminalId: vi.fn(),
            copyTailResetTimeoutByTerminalIdRef: { current: {} },
            pruneAndPersistStoredHistory: vi.fn(),
          }),
          reloadCommandPacks: vi.fn(async () => {}),
          reloadPipelineFlows: vi.fn(async () => {}),
        }),
      {
        initialProps: {
          steps: [{ id: 'step_1', type: 'template', label: 'Step', command: 'echo 1' }],
        },
      },
    )

    await act(async () => {
      await result.current.executePipeline()
    })
    expect(result.current.run?.id).toBe('run_1')
    expect(setBackendError).toHaveBeenCalledWith(null)

    await act(async () => {
      await result.current.stopRun()
    })
    expect(result.current.run?.status).toBe('stopped')

    await act(async () => {
      await result.current.executePipeline()
    })
    expect(setBackendError).toHaveBeenCalledWith('run failed')

    rerender({ steps: [] })
    await act(async () => {
      await result.current.executePipeline()
    })
    // no extra api call for empty steps
    expect(apiRequestMock).toHaveBeenCalledTimes(3)
  })
})
