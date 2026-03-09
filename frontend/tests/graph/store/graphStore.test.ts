import { afterEach, describe, expect, it } from 'vitest'
import { useGraphStore } from '../../../src/graph/store/graphStore'

const resetGraphStore = (): void => {
  window.localStorage.removeItem('graph-editor-state')
  useGraphStore.setState({
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    activeTerminalIds: [],
    terminalStatuses: {},
    globalVariables: {},
    sshConnections: [],
  })
}

describe('useGraphStore serialization', () => {
  afterEach(() => {
    resetGraphStore()
  })

  it('includes global variables in serialized graph state', () => {
    resetGraphStore()
    useGraphStore.getState().setGlobalVariable('login', 'operator')
    useGraphStore.getState().setGlobalVariable('env', 'prod')
    useGraphStore.getState().saveSshConnection({
      username: 'deploy',
      host: '10.0.0.10',
      password: 'secret',
    })

    const serialized = useGraphStore.getState().serialize()

    expect(serialized.globalVariables).toEqual({
      login: 'operator',
      env: 'prod',
    })
    expect(serialized.sshConnections).toHaveLength(1)
  })

  it('restores and clears global variables with graph state', () => {
    resetGraphStore()

    useGraphStore.getState().deserialize({
      nodes: [],
      edges: [],
      viewport: { x: 12, y: 18, zoom: 1.2 },
      globalVariables: {
        token: 'abc123',
      },
      sshConnections: [
        {
          id: 'ssh_1',
          username: 'deploy',
          host: '10.0.0.20',
          password: 'topsecret',
        },
      ],
    })

    expect(useGraphStore.getState().globalVariables).toEqual({
      token: 'abc123',
    })
    expect(useGraphStore.getState().sshConnections).toEqual([
      {
        id: 'ssh_1',
        username: 'deploy',
        host: '10.0.0.20',
        password: 'topsecret',
      },
    ])

    useGraphStore.getState().clear()

    expect(useGraphStore.getState().globalVariables).toEqual({})
    expect(useGraphStore.getState().sshConnections).toEqual([])
  })

  it('persists global variables to local storage snapshot', () => {
    resetGraphStore()

    useGraphStore.getState().setGlobalVariable('region', 'eu-west')
    useGraphStore.getState().saveSshConnection({
      id: 'ssh_saved',
      username: 'ops',
      host: '192.168.1.5',
      password: 'pw',
    })

    const persistedRaw = window.localStorage.getItem('graph-editor-state')
    expect(persistedRaw).not.toBeNull()

    const persisted = JSON.parse(persistedRaw ?? '{}') as {
      state?: {
        globalVariables?: Record<string, string>
        sshConnections?: Array<{ id: string; username: string; host: string; password: string }>
      }
    }
    expect(persisted.state?.globalVariables).toEqual({
      region: 'eu-west',
    })
    expect(persisted.state?.sshConnections).toEqual([
      {
        id: 'ssh_saved',
        username: 'ops',
        host: '192.168.1.5',
        password: 'pw',
      },
    ])
  })

  it('imports pipeline draft into executable graph nodes and edges', () => {
    resetGraphStore()

    useGraphStore.getState().importPipelineDraft({
      flow_name: 'Deploy flow',
      summary: 'Deploy app',
      assumptions: [],
      warnings: [],
      variables: [
        {
          name: 'host',
          description: 'Deployment target',
          default_value: 'srv-01',
          required: true,
        },
      ],
      steps: [
        {
          id: 'step_1',
          label: 'Check host',
          command: 'ping -c 1 {host}',
          description: 'Check connectivity',
          uses_variables: ['host'],
          template_id: null,
          terminal_type: 'local',
        },
        {
          id: 'step_2',
          label: 'Run deploy',
          command: 'deploy-tool --host {host}',
          description: 'Deploy application',
          uses_variables: ['host'],
          template_id: null,
          terminal_type: 'local',
        },
      ],
      target_terminal: {
        type: 'local',
        connection_hint: null,
      },
      confidence: 0.74,
    })

    const state = useGraphStore.getState()

    expect(state.nodes.filter((node) => node.type === 'variable')).toHaveLength(1)
    expect(state.nodes.filter((node) => node.type === 'command')).toHaveLength(2)
    expect(state.nodes.filter((node) => node.type === 'terminal')).toHaveLength(1)
    expect(state.edges.filter((edge) => edge.type === 'chain')).toHaveLength(2)
    expect(state.edges.filter((edge) => edge.type === 'variable')).toHaveLength(2)
  })

  it('auto-inserts a new command node into an intersected chain edge', () => {
    resetGraphStore()

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
          id: 'edge-original',
          source: 'command-start',
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

    const insertedId = useGraphStore.getState().addCommandNode({ x: 280, y: 0 }, {
      label: 'Middle',
      command: 'echo middle',
    })

    const state = useGraphStore.getState()

    expect(state.edges).toHaveLength(2)
    expect(state.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'command-start',
          target: insertedId,
          sourceHandle: 'chain-out',
          targetHandle: 'chain-in',
          type: 'chain',
        }),
        expect.objectContaining({
          source: insertedId,
          target: 'terminal-end',
          sourceHandle: 'chain-out',
          targetHandle: 'chain-in',
          type: 'chain',
        }),
      ]),
    )
  })

  it('inserts an existing orphan command node into a chain edge on demand', () => {
    resetGraphStore()

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
          position: { x: 280, y: 0 },
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
          id: 'edge-original',
          source: 'command-start',
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

    const wasInserted = useGraphStore.getState().insertNodeIntoIntersectedChain('command-middle')
    const state = useGraphStore.getState()

    expect(wasInserted).toBe(true)
    expect(state.edges).toHaveLength(2)
    expect(state.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'command-start',
          target: 'command-middle',
          type: 'chain',
        }),
        expect.objectContaining({
          source: 'command-middle',
          target: 'terminal-end',
          type: 'chain',
        }),
      ]),
    )
  })

  it('reconnects adjacent chain nodes when deleting a middle node', () => {
    resetGraphStore()

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

    useGraphStore.getState().deleteNode('command-middle')

    const state = useGraphStore.getState()
    expect(state.nodes.map((node) => node.id)).toEqual(['command-start', 'terminal-end'])
    expect(state.edges).toEqual([
      expect.objectContaining({
        source: 'command-start',
        target: 'terminal-end',
        sourceHandle: 'chain-out',
        targetHandle: 'chain-in',
        type: 'chain',
      }),
    ])
  })

  it('reconnects across consecutive deleted chain nodes', () => {
    resetGraphStore()

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
          id: 'command-middle-1',
          type: 'command',
          position: { x: 220, y: 0 },
          data: {
            label: 'Middle 1',
            command: 'echo middle 1',
            description: '',
            variableNames: [],
          },
        },
        {
          id: 'command-middle-2',
          type: 'command',
          position: { x: 440, y: 0 },
          data: {
            label: 'Middle 2',
            command: 'echo middle 2',
            description: '',
            variableNames: [],
          },
        },
        {
          id: 'terminal-end',
          type: 'terminal',
          position: { x: 700, y: 0 },
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
          target: 'command-middle-1',
          sourceHandle: 'chain-out',
          targetHandle: 'chain-in',
          type: 'chain',
        },
        {
          id: 'edge-2',
          source: 'command-middle-1',
          target: 'command-middle-2',
          sourceHandle: 'chain-out',
          targetHandle: 'chain-in',
          type: 'chain',
        },
        {
          id: 'edge-3',
          source: 'command-middle-2',
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

    useGraphStore.getState().deleteNodes(['command-middle-1', 'command-middle-2'])

    const state = useGraphStore.getState()
    expect(state.nodes.map((node) => node.id)).toEqual(['command-start', 'terminal-end'])
    expect(state.edges).toEqual([
      expect.objectContaining({
        source: 'command-start',
        target: 'terminal-end',
        sourceHandle: 'chain-out',
        targetHandle: 'chain-in',
        type: 'chain',
      }),
    ])
  })

  it('imports multi-terminal pipeline draft with a sequence node', () => {
    resetGraphStore()

    useGraphStore.getState().importPipelineDraft({
      flow_name: 'Unitree G1 Collection - General',
      summary: 'Run teleop in one terminal and collect in another.',
      assumptions: [],
      warnings: [],
      variables: [],
      steps: [
        {
          id: 'step_1',
          label: 'Obtain Code',
          command: 'download_physical_ai_code.sh --fetch stable',
          description: 'Fetch the code.',
          uses_variables: [],
          template_id: null,
          terminal_type: 'local',
          terminal_group: 'teleop_terminal',
        },
        {
          id: 'step_2',
          label: 'Start Teleop',
          command: '$HOME/ruka/third_party/xr_teleoperate/teleop/run_with_robo_app.sh --hands=right --ee=dex3',
          description: 'Run teleop.',
          uses_variables: [],
          template_id: null,
          terminal_type: 'local',
          terminal_group: 'teleop_terminal',
        },
        {
          id: 'step_3',
          label: 'Start Docker',
          command: 'cd ~/ruka && ./ruka docker -i dev2',
          description: 'Start docker.',
          uses_variables: [],
          template_id: null,
          terminal_type: 'local',
          terminal_group: 'collect_terminal',
        },
        {
          id: 'step_4',
          label: 'Collect Snacks',
          command: './ruka skill collect --track pretraining --app {app_ip}',
          description: 'Run collect.',
          uses_variables: ['app_ip'],
          template_id: null,
          terminal_type: 'local',
          terminal_group: 'collect_terminal',
        },
      ],
      target_terminal: {
        type: 'local',
        connection_hint: null,
      },
      confidence: 0.91,
    })

    const state = useGraphStore.getState()

    expect(state.nodes.filter((node) => node.type === 'command')).toHaveLength(4)
    expect(state.nodes.filter((node) => node.type === 'terminal')).toHaveLength(2)
    expect(state.nodes.filter((node) => node.type === 'sequence')).toHaveLength(1)
    expect(state.edges.filter((edge) => edge.type === 'chain')).toHaveLength(4)
    expect(state.edges.filter((edge) => edge.type === 'sequence')).toHaveLength(2)

    const terminalLabels = state.nodes
      .filter((node) => node.type === 'terminal')
      .map((node) => String(node.data.label))
    expect(terminalLabels).toEqual(expect.arrayContaining(['Teleop Terminal', 'Collect Terminal']))
  })

  it('switches a terminal node to ssh-terminal without changing node id or edges', () => {
    resetGraphStore()

    useGraphStore.setState({
      nodes: [
        {
          id: 'command-1',
          type: 'command',
          position: { x: 0, y: 0 },
          data: {
            label: 'Run deploy',
            command: 'deploy-tool',
            description: '',
            variableNames: [],
          },
        },
        {
          id: 'terminal-1',
          type: 'terminal',
          position: { x: 320, y: 0 },
          data: {
            label: 'Main Terminal',
            terminalId: 'term_backend_1',
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'command-1',
          target: 'terminal-1',
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

    useGraphStore.getState().switchTerminalNodeType('terminal-1')

    const state = useGraphStore.getState()
    const switchedNode = state.nodes.find((node) => node.id === 'terminal-1')
    expect(switchedNode?.type).toBe('ssh-terminal')
    expect(switchedNode?.data).toMatchObject({
      label: 'Main Terminal',
      terminalId: null,
      connectionId: null,
      sshUsername: '',
      sshHost: '',
      sshPassword: '',
    })
    expect(state.edges).toEqual([
      {
        id: 'edge-1',
        source: 'command-1',
        target: 'terminal-1',
        sourceHandle: 'chain-out',
        targetHandle: 'chain-in',
        type: 'chain',
      },
    ])

    useGraphStore.getState().switchTerminalNodeType('terminal-1')

    const revertedNode = useGraphStore.getState().nodes.find((node) => node.id === 'terminal-1')
    expect(revertedNode?.type).toBe('terminal')
    expect(revertedNode?.data).toMatchObject({
      label: 'Main Terminal',
      terminalId: null,
    })
  })
})
