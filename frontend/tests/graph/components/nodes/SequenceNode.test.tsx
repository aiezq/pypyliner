import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { screen } from '@testing-library/react'
import SequenceNode from '../../../../src/graph/components/nodes/SequenceNode'
import { useGraphStore } from '../../../../src/graph/store/graphStore'
import { renderWithProviders } from '../../../renderWithProviders'

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}))

vi.mock('../../../../src/graph/hooks/useSequenceExecution', () => ({
  useSequenceExecution: () => ({
    executeSequenceNode: vi.fn(),
  }),
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

function SequenceNodeHost() {
  const node = useGraphStore((state) => state.nodes.find((item) => item.id === 'sequence-1'))
  if (!node || node.type !== 'sequence') {
    return null
  }

  const props = {
    id: node.id,
    data: node.data,
    selected: Boolean(node.selected),
    dragging: false,
    zIndex: 0,
    isConnectable: true,
  } as unknown as ComponentProps<typeof SequenceNode>

  return <SequenceNode {...props} />
}

describe('SequenceNode runtime jobs', () => {
  afterEach(() => {
    resetGraphStore()
  })

  it('renders per-job runtime metadata from backend sequence state', () => {
    resetGraphStore()
    useGraphStore.setState({
      nodes: [
        {
          id: 'terminal-1',
          type: 'terminal',
          position: { x: 0, y: 0 },
          data: {
            label: 'Prepare',
            terminalId: 'term_1',
            terminalSessionId: 'term_1',
          },
        },
        {
          id: 'sequence-1',
          type: 'sequence',
          position: { x: 260, y: 0 },
          data: {
            label: 'Deploy flow',
            sequenceId: 'sequence_runtime_1',
            status: 'running',
            currentTerminalIndex: 0,
            finishedAt: null,
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'terminal-1',
          target: 'sequence-1',
          sourceHandle: 'sequence-out',
          targetHandle: 'seq-in-0',
          type: 'sequence',
        },
      ],
      sequenceExecutionsById: {
        sequence_runtime_1: {
          id: 'sequence_runtime_1',
          sequenceNodeId: 'sequence-1',
          status: 'running',
          currentTerminalIndex: 0,
          createdAt: '2026-03-11T09:00:00Z',
          startedAt: '2026-03-11T09:00:01Z',
          finishedAt: null,
          terminalJobs: [
            {
              terminalNodeId: 'terminal-1',
              terminalSessionId: 'term_1',
              title: 'Prepare',
              terminalType: 'local',
              status: 'running',
            },
          ],
        },
      },
      activeSequenceExecutionIdByNodeId: {
        'sequence-1': 'sequence_runtime_1',
      },
    })

    renderWithProviders(<SequenceNodeHost />)

    expect(screen.getByText('1. Prepare')).toBeVisible()
    expect(screen.getByText('LOCAL • running')).toBeVisible()
  })
})
