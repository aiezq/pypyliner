import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { screen } from '@testing-library/react'
import TerminalNode from '../../../../src/graph/components/nodes/TerminalNode'
import { useGraphStore } from '../../../../src/graph/store/graphStore'
import { renderWithProviders } from '../../../renderWithProviders'

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}))

vi.mock('../../../../src/graph/hooks/useGraphExecution', () => ({
  useGraphExecution: () => ({
    executeTerminalNode: vi.fn(),
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

function TerminalNodeHost() {
  const node = useGraphStore((state) => state.nodes.find((item) => item.id === 'terminal-1'))
  if (!node || node.type !== 'terminal') {
    return null
  }

  const props = {
    id: node.id,
    data: node.data,
    selected: Boolean(node.selected),
    dragging: false,
    zIndex: 0,
    isConnectable: true,
  } as unknown as ComponentProps<typeof TerminalNode>

  return <TerminalNode {...props} />
}

describe('TerminalNode runtime status', () => {
  afterEach(() => {
    resetGraphStore()
  })

  it('renders exact backend runtime status and command index', () => {
    resetGraphStore()
    useGraphStore.setState({
      nodes: [
        {
          id: 'terminal-1',
          type: 'terminal',
          position: { x: 0, y: 0 },
          data: {
            label: 'Deploy terminal',
            terminalId: 'term_1',
            terminalSessionId: 'term_1',
          },
        },
      ],
      terminalSessionsById: {
        term_1: {
          terminalNodeId: 'terminal-1',
          terminalType: 'local',
          sequenceId: null,
          status: 'running',
          currentCommandIndex: 1,
          exitCode: null,
          stdinEnabled: false,
        },
      },
    })

    renderWithProviders(<TerminalNodeHost />)

    expect(screen.getByText(/Terminal: term_1/)).toBeVisible()
    expect(screen.getByText(/running • 2/)).toBeVisible()
  })
})
