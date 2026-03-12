import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { screen } from '@testing-library/react'
import SshTerminalNode from '../../../../src/graph/components/nodes/SshTerminalNode'
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

function SshTerminalNodeHost() {
  const node = useGraphStore((state) => state.nodes.find((item) => item.id === 'ssh-terminal-1'))
  if (!node || node.type !== 'ssh-terminal') {
    return null
  }

  const props = {
    id: node.id,
    data: node.data,
    selected: Boolean(node.selected),
    dragging: false,
    zIndex: 0,
    isConnectable: true,
  } as unknown as ComponentProps<typeof SshTerminalNode>

  return <SshTerminalNode {...props} />
}

describe('SshTerminalNode runtime status', () => {
  afterEach(() => {
    resetGraphStore()
  })

  it('renders exact backend ssh runtime status and session id', () => {
    resetGraphStore()
    useGraphStore.setState({
      nodes: [
        {
          id: 'ssh-terminal-1',
          type: 'ssh-terminal',
          position: { x: 0, y: 0 },
          data: {
            label: 'Deploy via SSH',
            terminalId: 'term_ssh_1',
            terminalSessionId: 'term_ssh_1',
            connectionId: null,
            sshUsername: 'operator',
            sshHost: 'example.com',
            sshPassword: '',
            sshCommand: 'ssh -tt operator@example.com',
          },
        },
      ],
      terminalSessionsById: {
        term_ssh_1: {
          terminalNodeId: 'ssh-terminal-1',
          terminalType: 'ssh',
          sequenceId: null,
          status: 'running',
          currentCommandIndex: 0,
          exitCode: null,
          stdinEnabled: false,
        },
      },
    })

    renderWithProviders(<SshTerminalNodeHost />)

    expect(screen.getByText(/Terminal: term_ssh_1/)).toBeVisible()
    expect(screen.getByText(/running • 1/)).toBeVisible()
  })
})
