import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ContextMenu from '../../../src/graph/components/ContextMenu'
import { useGraphStore } from '../../../src/graph/store/graphStore'
import { usePresetsStore } from '../../../src/graph/store/presetsStore'
import type { ContextMenuState } from '../../../src/graph/hooks/useContextMenu'

function resetStores(): void {
  window.localStorage.removeItem('graph-editor-state')
  window.localStorage.removeItem('graph-presets')
  useGraphStore.setState({
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    activeTerminalIds: [],
    terminalStatuses: {},
    globalVariables: {},
    sshConnections: [],
  })
  usePresetsStore.setState({
    presets: [],
  })
}

const baseMenu: ContextMenuState = {
  isOpen: true,
  mode: 'node',
  x: 40,
  y: 50,
  canvasX: 40,
  canvasY: 50,
  nodeId: 'ssh-terminal-1',
  selectedNodeIds: [],
  edgeId: null,
}

describe('ContextMenu terminal switching', () => {
  afterEach(() => {
    resetStores()
  })

  it('shows terminal type switch action for ssh terminal nodes and converts them back to default terminal', () => {
    resetStores()
    useGraphStore.setState({
      nodes: [
        {
          id: 'ssh-terminal-1',
          type: 'ssh-terminal',
          position: { x: 120, y: 80 },
          data: {
            label: 'Remote Terminal',
            terminalId: 'ssh_backend_1',
            connectionId: 'ssh_saved',
            sshUsername: 'ops',
            sshHost: '10.0.0.12',
            sshPassword: 'secret',
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

    render(<ContextMenu menu={baseMenu} onClose={() => undefined} />)

    const switchButton = screen.getByRole('button', { name: /Switch to Default Terminal/i })
    expect(switchButton).toBeInTheDocument()

    fireEvent.click(switchButton)

    const switchedNode = useGraphStore.getState().nodes.find((node) => node.id === 'ssh-terminal-1')
    expect(switchedNode?.type).toBe('terminal')
    expect(switchedNode?.data).toMatchObject({
      label: 'Remote Terminal',
      terminalId: null,
    })
  })
})
