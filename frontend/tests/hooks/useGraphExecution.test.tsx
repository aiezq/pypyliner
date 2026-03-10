import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGraphExecution } from '../../src/graph/hooks/useGraphExecution'
import { useGraphStore } from '../../src/graph/store/graphStore'

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

describe('useGraphExecution', () => {
  beforeEach(() => {
    resetGraphStore()
  })

  afterEach(() => {
    resetGraphStore()
  })

  it('resolves without backend terminal execution', async () => {
    const { result } = renderHook(() => useGraphExecution())

    await expect(result.current.executeTerminalNode('terminal_1')).resolves.toBeUndefined()
  })
})
