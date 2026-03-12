import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useManualTerminalControllerMock = vi.hoisted(() => vi.fn())

vi.mock('../../../src/hooks/useManualTerminalController', () => ({
  useManualTerminalController: useManualTerminalControllerMock,
}))

import { useTerminalFeature } from '../../../src/features/terminal/useTerminalFeature'

describe('useTerminalFeature', () => {
  class FakeWebSocket {
    static instances: FakeWebSocket[] = []

    url: string
    listeners: Record<string, Array<(event?: MessageEvent) => void>> = {}
    close = vi.fn()

    constructor(url: string) {
      this.url = url
      FakeWebSocket.instances.push(this)
    }

    addEventListener(type: string, listener: (event?: MessageEvent) => void) {
      this.listeners[type] ??= []
      this.listeners[type].push(listener)
    }

    emit(type: string, event?: MessageEvent) {
      for (const listener of this.listeners[type] ?? []) {
        listener(event)
      }
    }
  }

  beforeEach(() => {
    window.localStorage.removeItem('operator_helper.pinned_terminals.v1')
    useManualTerminalControllerMock.mockReset()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
  })

  it('initializes layout managers and stores references correctly', () => {
    const manual = { getSocketEventContext: vi.fn(() => ({})) }
    useManualTerminalControllerMock.mockReturnValue(manual)

    const setBackendError = vi.fn()
    const { result } = renderHook(() => useTerminalFeature({ setBackendError }))

    expect(result.current.manual).toBe(manual)
    expect(result.current.requestedMinimizedTerminalWindowIds).toEqual([])
  })

  it('hydrates runtime terminals from websocket snapshot events', async () => {
    const applyTerminalSnapshot = vi.fn()
    const removeTerminalSession = vi.fn()
    const manual = {
      getSocketEventContext: vi.fn(() => ({
        applyTerminalSnapshot,
        removeTerminalSession,
      })),
    }
    useManualTerminalControllerMock.mockReturnValue(manual)

    const setBackendError = vi.fn()
    const { result } = renderHook(() => useTerminalFeature({ setBackendError }))

    expect(FakeWebSocket.instances).toHaveLength(1)

    await act(async () => {
      FakeWebSocket.instances[0]?.emit('open')
      FakeWebSocket.instances[0]?.emit(
        'message',
        {
          data: JSON.stringify({
            type: 'snapshot',
            data: {
              runs: [],
              terminals: [
                {
                  id: 'term_1',
                  terminal_node_id: 'node_terminal_1',
                  sequence_id: null,
                  title: 'Runtime Terminal',
                  terminal_type: 'local',
                  ssh_connection_name: null,
                  ssh_host: null,
                  ssh_username: null,
                  status: 'running',
                  created_at: '2026-03-11T09:00:00Z',
                  started_at: '2026-03-11T09:00:01Z',
                  finished_at: null,
                  exit_code: null,
                  current_command_index: 0,
                  current_command_id: 'cmd_1',
                  shell_pid: 42,
                  queue: [],
                  lines: [],
                },
              ],
              sequences: [],
            },
          }),
        } as MessageEvent,
      )
    })

    expect(result.current.isSocketConnected).toBe(true)
    expect(applyTerminalSnapshot).toHaveBeenCalledTimes(1)
    expect(setBackendError).toHaveBeenCalledWith(null)
    expect(result.current.sequenceExecutions).toEqual([])

    await act(async () => {
      FakeWebSocket.instances[0]?.emit(
        'message',
        {
          data: JSON.stringify({
            type: 'terminal_deleted',
            data: {
              terminal_session_id: 'term_1',
            },
          }),
        } as MessageEvent,
      )
    })

    expect(removeTerminalSession).toHaveBeenCalledWith('term_1')
  })

  it('tracks sequence executions from snapshot and status events', async () => {
    useManualTerminalControllerMock.mockReturnValue({
      getSocketEventContext: vi.fn(() => ({
        applyTerminalSnapshot: vi.fn(),
      })),
    })

    const setBackendError = vi.fn()
    const { result } = renderHook(() => useTerminalFeature({ setBackendError }))

    await act(async () => {
      FakeWebSocket.instances[0]?.emit(
        'message',
        {
          data: JSON.stringify({
            type: 'snapshot',
            data: {
              runs: [],
              terminals: [],
              sequences: [
                {
                  id: 'sequence_1',
                  sequence_node_id: 'node_sequence_1',
                  status: 'running',
                  current_terminal_index: 0,
                  created_at: '2026-03-11T09:00:00Z',
                  started_at: '2026-03-11T09:00:01Z',
                  finished_at: null,
                  terminal_jobs: [
                    {
                      terminal_node_id: 'node_terminal_1',
                      terminal_session_id: 'term_1',
                      title: 'Terminal 1',
                      terminal_type: 'local',
                      status: 'running',
                    },
                  ],
                },
              ],
            },
          }),
        } as MessageEvent,
      )
    })

    expect(result.current.sequenceExecutions).toMatchObject([
      {
        id: 'sequence_1',
        sequenceNodeId: 'node_sequence_1',
        status: 'running',
        currentTerminalIndex: 0,
      },
    ])

    await act(async () => {
      FakeWebSocket.instances[0]?.emit(
        'message',
        {
          data: JSON.stringify({
            type: 'terminal_created',
            data: {
              terminal: {
                id: 'term_1',
                terminal_node_id: 'node_terminal_1',
                sequence_id: 'sequence_1',
                title: 'Terminal 1',
                terminal_type: 'local',
                ssh_connection_name: null,
                ssh_host: null,
                ssh_username: null,
                status: 'starting',
                created_at: '2026-03-11T09:00:01Z',
                started_at: '2026-03-11T09:00:02Z',
                finished_at: null,
                exit_code: null,
                current_command_index: null,
                current_command_id: null,
                shell_pid: 42,
                stdin_enabled: false,
                queue: [],
                lines: [],
              },
            },
          }),
        } as MessageEvent,
      )
    })

    expect(result.current.sequenceExecutions).toMatchObject([
      {
        id: 'sequence_1',
        terminalJobs: [
          {
            terminalNodeId: 'node_terminal_1',
            terminalSessionId: 'term_1',
          },
        ],
      },
    ])

    await act(async () => {
      FakeWebSocket.instances[0]?.emit(
        'message',
        {
          data: JSON.stringify({
            type: 'sequence_status',
            data: {
              sequence_id: 'sequence_1',
              sequence_node_id: 'node_sequence_1',
              status: 'success',
              current_terminal_index: 0,
              finished_at: '2026-03-11T09:00:05Z',
            },
          }),
        } as MessageEvent,
      )
    })

    expect(result.current.sequenceExecutions).toMatchObject([
      {
        id: 'sequence_1',
        status: 'success',
        finishedAt: '2026-03-11T09:00:05Z',
      },
    ])
  })

  it('keeps a single websocket connection across rerenders and uses latest socket context', async () => {
    const applyTerminalSnapshotV1 = vi.fn()
    const applyTerminalSnapshotV2 = vi.fn()
    let renderCount = 0

    useManualTerminalControllerMock.mockImplementation(() => {
      renderCount += 1
      return {
        getSocketEventContext: vi.fn(() => ({
          applyTerminalSnapshot: renderCount > 1 ? applyTerminalSnapshotV2 : applyTerminalSnapshotV1,
        })),
      }
    })

    const setBackendError = vi.fn()
    const { rerender } = renderHook(() => useTerminalFeature({ setBackendError }))

    expect(FakeWebSocket.instances).toHaveLength(1)

    rerender()

    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(FakeWebSocket.instances[0]?.close).not.toHaveBeenCalled()

    await act(async () => {
      FakeWebSocket.instances[0]?.emit(
        'message',
        {
          data: JSON.stringify({
            type: 'snapshot',
            data: {
              runs: [],
              terminals: [],
              sequences: [],
            },
          }),
        } as MessageEvent,
      )
    })

    expect(applyTerminalSnapshotV1).not.toHaveBeenCalled()
    expect(applyTerminalSnapshotV2).toHaveBeenCalledTimes(1)
  })
})
