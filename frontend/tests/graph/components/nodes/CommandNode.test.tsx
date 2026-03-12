import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import CommandNode from '../../../../src/graph/components/nodes/CommandNode'
import { useGraphStore } from '../../../../src/graph/store/graphStore'
import { renderWithProviders } from '../../../renderWithProviders'

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
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

function CommandNodeHost() {
  const node = useGraphStore((state) => state.nodes.find((item) => item.id === 'command-1'))
  if (!node || node.type !== 'command') {
    return null
  }

  const props = {
    id: node.id,
    data: node.data,
    selected: Boolean(node.selected),
    dragging: false,
    zIndex: 0,
    isConnectable: true,
  } as unknown as ComponentProps<typeof CommandNode>

  return (
    <CommandNode {...props} />
  )
}

describe('CommandNode inline command editing', () => {
  afterEach(() => {
    resetGraphStore()
  })

  it('saves the node title from the header inline editor', () => {
    resetGraphStore()
    useGraphStore.setState({
      nodes: [
        {
          id: 'command-1',
          type: 'command',
          position: { x: 0, y: 0 },
          data: {
            label: 'Deploy app',
            command: 'deploy.sh',
            description: '',
            variableNames: [],
          },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      activeTerminalIds: [],
      terminalStatuses: {},
      globalVariables: {},
      sshConnections: [],
    })

    renderWithProviders(<CommandNodeHost />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit node title: Deploy app' }))

    const titleEditor = screen.getByRole('textbox', { name: 'Node title editor' })
    fireEvent.change(titleEditor, { target: { value: 'Deploy production' } })
    fireEvent.keyDown(titleEditor, { key: 'Enter', code: 'Enter' })

    expect(useGraphStore.getState().nodes[0].data).toMatchObject({
      label: 'Deploy production',
    })
    expect(screen.queryByRole('textbox', { name: 'Node title editor' })).not.toBeInTheDocument()
  })

  it('saves the command via inline editor on Enter and hides the textarea again', () => {
    resetGraphStore()
    useGraphStore.setState({
      nodes: [
        {
          id: 'command-1',
          type: 'command',
          position: { x: 0, y: 0 },
          data: {
            label: 'New Command',
            command: '',
            description: '',
            variableNames: [],
          },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      activeTerminalIds: [],
      terminalStatuses: {},
      globalVariables: {},
      sshConnections: [],
    })

    renderWithProviders(<CommandNodeHost />)

    fireEvent.click(screen.getByRole('button', { name: 'Click to enter command' }))

    const editor = screen.getByRole('textbox', { name: 'Command editor' })
    fireEvent.change(editor, { target: { value: 'echo from inline editor' } })
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter' })

    const commandNode = useGraphStore.getState().nodes[0]
    expect(commandNode.data).toMatchObject({
      command: 'echo from inline editor',
      label: 'echo from inline editor',
    })
    expect(screen.queryByRole('textbox', { name: 'Command editor' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'echo from inline editor' })).toBeVisible()
  })

  it('renders template variables with highlighted styling in the preview', () => {
    resetGraphStore()
    useGraphStore.setState({
      nodes: [
        {
          id: 'command-1',
          type: 'command',
          position: { x: 0, y: 0 },
          data: {
            label: 'Deploy',
            command: 'deploy --host {host} --user {user}',
            description: '',
            variableNames: ['host', 'user'],
          },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      activeTerminalIds: [],
      terminalStatuses: {},
      globalVariables: {},
      sshConnections: [],
    })

    renderWithProviders(<CommandNodeHost />)

    const variableTokens = screen.getAllByText(/\{(host|user)\}/)
      .filter((element) => element.className.includes('nodeCodeVariable'))

    expect(variableTokens).toHaveLength(2)
  })
})
