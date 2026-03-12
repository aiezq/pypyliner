import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import GraphEditor from '../../../src/graph/components/GraphEditor'
import { useGraphStore } from '../../../src/graph/store/graphStore'
import { renderWithProviders } from '../../renderWithProviders'

let reactFlowProps: ComponentProps<typeof import('@xyflow/react').ReactFlow> | null = null

vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: ComponentProps<'div'>) => {
    reactFlowProps = props as ComponentProps<typeof import('@xyflow/react').ReactFlow>
    return <div data-testid="react-flow">{props.children}</div>
  },
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  BackgroundVariant: { Dots: 'dots' },
  Position: { Left: 'left', Right: 'right' },
}))

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

describe('GraphEditor deletion hooks', () => {
  beforeEach(() => {
    reactFlowProps = null
    resetGraphStore()
  })

  afterEach(() => {
    resetGraphStore()
  })

  it('reroutes hotkey node deletion through custom chain reconnect logic', async () => {
    useGraphStore.setState({
      nodes: [
        {
          id: 'command-start',
          type: 'command',
          position: { x: 0, y: 0 },
          data: {
            label: 'Start',
            command: 'echo start',
            description: '',
            variableNames: [],
          },
        },
        {
          id: 'command-middle',
          type: 'command',
          position: { x: 260, y: 0 },
          data: {
            label: 'Middle',
            command: 'echo middle',
            description: '',
            variableNames: [],
          },
        },
        {
          id: 'terminal-end',
          type: 'terminal',
          position: { x: 560, y: 0 },
          data: {
            label: 'End',
            terminalId: null,
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'command-start',
          target: 'command-middle',
          sourceHandle: 'chain-out',
          targetHandle: 'chain-in',
          type: 'chain',
        },
        {
          id: 'edge-2',
          source: 'command-middle',
          target: 'terminal-end',
          sourceHandle: 'chain-out',
          targetHandle: 'chain-in',
          type: 'chain',
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      activeTerminalIds: [],
      terminalStatuses: {},
      globalVariables: {},
      sshConnections: [],
    })

    renderWithProviders(<GraphEditor />)

    expect(reactFlowProps?.onBeforeDelete).toBeTypeOf('function')

    const result = await reactFlowProps?.onBeforeDelete?.({
      nodes: [useGraphStore.getState().nodes[1]],
      edges: useGraphStore.getState().edges,
    })

    expect(result).toBe(false)
    expect(useGraphStore.getState().edges).toEqual([
      expect.objectContaining({
        source: 'command-start',
        target: 'terminal-end',
        sourceHandle: 'chain-out',
        targetHandle: 'chain-in',
        type: 'chain',
      }),
    ])
  })
})
