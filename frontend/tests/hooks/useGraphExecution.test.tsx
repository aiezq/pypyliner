import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useGraphExecution } from '../../src/graph/hooks/useGraphExecution'
import { useGraphStore } from '../../src/graph/store/graphStore'
import { NODE_TYPES } from '../../src/graph/types'

const resetGraphStore = (): void => {
  window.localStorage.removeItem('graph-editor-state')
  useGraphStore.setState({
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    activeTerminalIds: [],
    terminalStatuses: {},
    terminalSessionsById: {},
    terminalSessionIdByNodeId: {},
    terminalCurrentCommandIndexById: {},
    sequenceExecutionsById: {},
    activeSequenceExecutionIdByNodeId: {},
    globalVariables: {},
    sshConnections: [],
  })
}

describe('useGraphExecution', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    resetGraphStore()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    resetGraphStore()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('executes a terminal node via backend terminal runtime', async () => {
    useGraphStore.setState({
      nodes: [
        {
          id: 'cmd_1',
          type: NODE_TYPES.COMMAND,
          position: { x: 0, y: 0 },
          data: {
            label: 'Echo',
            command: 'echo hello',
            description: '',
            variableNames: [],
          },
        },
        {
          id: 'terminal_1',
          type: NODE_TYPES.TERMINAL,
          position: { x: 100, y: 0 },
          data: {
            label: 'Terminal',
            terminalId: null,
          },
        },
      ],
      edges: [
        {
          id: 'edge_1',
          source: 'cmd_1',
          target: 'terminal_1',
          sourceHandle: 'chain-out',
          targetHandle: 'chain-in',
          type: 'chain',
        },
      ],
    })
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        id: 'term_1',
        terminal_node_id: 'terminal_1',
        status: 'starting',
      })),
    })

    const { result } = renderHook(() => useGraphExecution())

    await act(async () => {
      await result.current.executeTerminalNode('terminal_1')
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useGraphStore.getState().nodes.find((node) => node.id === 'terminal_1')?.data).toMatchObject({
      terminalId: 'term_1',
      terminalSessionId: 'term_1',
    })
    expect(useGraphStore.getState().activeTerminalIds).toContain('term_1')
    expect(useGraphStore.getState().terminalStatuses.term_1).toBe('starting')
  })
})
