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
})
