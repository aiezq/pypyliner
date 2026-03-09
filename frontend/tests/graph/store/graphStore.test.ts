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

    const serialized = useGraphStore.getState().serialize()

    expect(serialized.globalVariables).toEqual({
      login: 'operator',
      env: 'prod',
    })
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
    })

    expect(useGraphStore.getState().globalVariables).toEqual({
      token: 'abc123',
    })

    useGraphStore.getState().clear()

    expect(useGraphStore.getState().globalVariables).toEqual({})
  })

  it('persists global variables to local storage snapshot', () => {
    resetGraphStore()

    useGraphStore.getState().setGlobalVariable('region', 'eu-west')

    const persistedRaw = window.localStorage.getItem('graph-editor-state')
    expect(persistedRaw).not.toBeNull()

    const persisted = JSON.parse(persistedRaw ?? '{}') as {
      state?: { globalVariables?: Record<string, string> }
    }
    expect(persisted.state?.globalVariables).toEqual({
      region: 'eu-west',
    })
  })
})
