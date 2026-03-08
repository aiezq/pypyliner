import { useCallback } from 'react'
import { apiRequest } from '../../lib/api'
import { resolveChain } from '../utils/graphResolver'
import { useGraphStore } from '../store/graphStore'
import type { GraphNode, GraphEdge } from '../types'

interface UseGraphExecutionReturn {
  executeTerminalNode: (terminalNodeId: string, isSequence?: boolean) => Promise<void>
}

/**
 * Hook that resolves a chain from a Terminal node and
 * sends each command sequentially to the backend terminal API.
 */
export function useGraphExecution(): UseGraphExecutionReturn {
  const executeTerminalNode = useCallback(async (terminalNodeId: string, isSequence: boolean = false) => {
    const { nodes, edges, updateNodeData, globalVariables } = useGraphStore.getState()

    const chain = resolveChain(
      terminalNodeId,
      nodes as GraphNode[],
      edges as GraphEdge[],
      globalVariables,
    )

    // Validate or create terminal
    let terminalId = chain.terminalId
    if (terminalId) {
      // Check if terminal still exists on backend (e.g. wasn't closed by user)
      const { manual_terminals } = await apiRequest<{ manual_terminals: { id: string }[] }>('/api/terminals')
      if (!manual_terminals.some((t) => t.id === terminalId)) {
        terminalId = null
      }
    }

    if (!terminalId) {
      const result = await apiRequest<{ id: string }>('/api/terminals', {
        method: 'POST',
        body: JSON.stringify({ 
          title: chain.terminalLabel,
          is_sequence: isSequence
        }),
      })
      terminalId = result.id
      updateNodeData(terminalNodeId, { terminalId })
    }

    // Execute each command in order
    for (const cmd of chain.commands) {
      const trimmedCommand = cmd.resolvedCommand.trim()
      if (!trimmedCommand) {
        continue
      }
      await apiRequest(`/api/terminals/${terminalId}/run`, {
        method: 'POST',
        body: JSON.stringify({ command: trimmedCommand }),
      })

      // Wait for the command to finish executing before moving to the next one
      while (true) {
        await new Promise((r) => setTimeout(r, 100))
        const statuses = useGraphStore.getState().terminalStatuses
        if (statuses[terminalId] === 'idle') {
          break
        }
      }
    }
  }, [])

  return { executeTerminalNode }
}
