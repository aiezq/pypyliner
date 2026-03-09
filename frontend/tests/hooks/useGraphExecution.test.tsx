import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const apiRequestMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/api', () => ({
  apiRequest: apiRequestMock,
}))

import { useGraphExecution } from '../../src/graph/hooks/useGraphExecution'
import { useGraphStore } from '../../src/graph/store/graphStore'
import { EDGE_TYPES, NODE_TYPES, type GraphEdge, type GraphNode } from '../../src/graph/types'

const createCommandNode = (command: string = 'echo hello'): GraphNode =>
  ({
    id: 'command_1',
    type: NODE_TYPES.COMMAND,
    position: { x: 0, y: 0 },
    data: {
      label: 'Command',
      command,
      description: '',
      variableNames: [],
    },
  }) as GraphNode

const createTerminalNode = (terminalId: string | null): GraphNode =>
  ({
    id: 'terminal_1',
    type: NODE_TYPES.TERMINAL,
    position: { x: 200, y: 0 },
    data: {
      label: 'Terminal',
      terminalId,
    },
  }) as GraphNode

const createChainEdge = (): GraphEdge =>
  ({
    id: 'edge_1',
    source: 'command_1',
    target: 'terminal_1',
    sourceHandle: 'chain-out',
    targetHandle: 'chain-in',
    type: EDGE_TYPES.CHAIN,
  }) as GraphEdge

const resetGraphStore = (): void => {
  window.localStorage.removeItem('graph-editor-state')
  useGraphStore.setState({
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    activeTerminalIds: [],
    terminalStatuses: {},
    globalVariables: {},
  })
}

describe('useGraphExecution', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    apiRequestMock.mockReset()
    resetGraphStore()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetGraphStore()
  })

  it('creates a terminal and waits until backend reports command completion', async () => {
    useGraphStore.setState({
      nodes: [createCommandNode(), createTerminalNode(null)],
      edges: [createChainEdge()],
    })

    let terminalCalls = 0
    apiRequestMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'

      if (path === '/api/terminals/terminal_created' && method === 'GET') {
        terminalCalls += 1
        if (terminalCalls === 1) {
          return { id: 'terminal_created', status: 'running' }
        }
        return { id: 'terminal_created', status: 'idle' }
      }

      if (path === '/api/terminals' && method === 'POST') {
        return { id: 'terminal_created' }
      }

      if (path === '/api/terminals/terminal_created/run' && method === 'POST') {
        return { id: 'terminal_created' }
      }

      throw new Error(`Unexpected request: ${method} ${path}`)
    })

    const { result } = renderHook(() => useGraphExecution())

    const executionPromise = result.current.executeTerminalNode('terminal_1')
    await vi.advanceTimersByTimeAsync(250)

    await expect(executionPromise).resolves.toBeUndefined()
    expect(useGraphStore.getState().nodes[1]?.data).toMatchObject({
      terminalId: 'terminal_created',
    })
  })

  it('fails when backend reports that the terminal was closed', async () => {
    useGraphStore.setState({
      nodes: [createCommandNode(), createTerminalNode('terminal_1')],
      edges: [createChainEdge()],
    })

    let terminalCalls = 0
    apiRequestMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'

      if (path === '/api/terminals/terminal_1' && method === 'GET') {
        terminalCalls += 1
        if (terminalCalls === 1) {
          return { id: 'terminal_1', status: 'idle' }
        }
        throw new Error('Terminal not found')
      }

      if (path === '/api/terminals/terminal_1/run' && method === 'POST') {
        return { id: 'terminal_1' }
      }

      throw new Error(`Unexpected request: ${method} ${path}`)
    })

    const { result } = renderHook(() => useGraphExecution())

    await expect(result.current.executeTerminalNode('terminal_1')).rejects.toThrow(
      'Terminal terminal_1 is no longer available',
    )
  })

  it('fails when command execution never reaches a terminal final state', async () => {
    useGraphStore.setState({
      nodes: [createCommandNode(), createTerminalNode('terminal_1')],
      edges: [createChainEdge()],
    })

    apiRequestMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'

      if (path === '/api/terminals/terminal_1' && method === 'GET') {
        return { id: 'terminal_1', status: 'running' }
      }

      if (path === '/api/terminals/terminal_1/run' && method === 'POST') {
        return { id: 'terminal_1' }
      }

      throw new Error(`Unexpected request: ${method} ${path}`)
    })

    const { result } = renderHook(() => useGraphExecution())

    const executionPromise = result.current.executeTerminalNode('terminal_1')
    const rejectionExpectation = expect(executionPromise).rejects.toThrow(
      'Timed out waiting for terminal terminal_1 to finish command',
    )
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

    await rejectionExpectation
  })

  it('reuses an existing terminal after confirming it with the point lookup endpoint', async () => {
    useGraphStore.setState({
      nodes: [createCommandNode(), createTerminalNode('terminal_1')],
      edges: [createChainEdge()],
    })

    let terminalCalls = 0
    apiRequestMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'

      if (path === '/api/terminals/terminal_1' && method === 'GET') {
        terminalCalls += 1
        if (terminalCalls === 1) {
          return { id: 'terminal_1', status: 'idle' }
        }
        return { id: 'terminal_1', status: 'success' }
      }

      if (path === '/api/terminals/terminal_1/run' && method === 'POST') {
        return { id: 'terminal_1' }
      }

      throw new Error(`Unexpected request: ${method} ${path}`)
    })

    const { result } = renderHook(() => useGraphExecution())

    await expect(result.current.executeTerminalNode('terminal_1')).resolves.toBeUndefined()
    expect(apiRequestMock).not.toHaveBeenCalledWith(
      '/api/terminals',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
