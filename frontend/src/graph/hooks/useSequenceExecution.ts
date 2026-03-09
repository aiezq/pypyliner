import { useCallback } from 'react'
import { useGraphStore } from '../store/graphStore'
import { EDGE_TYPES, NODE_TYPES } from '../types'
import { useGraphExecution } from './useGraphExecution'

export function useSequenceExecution() {
  const { executeTerminalNode } = useGraphExecution()

  const executeSequenceNode = useCallback(async (sequenceNodeId: string) => {
    const { edges, nodes } = useGraphStore.getState()
    
    // Find all sequence edges going into this Sequence node
    const sequenceEdges = edges.filter(
      (e) => e.target === sequenceNodeId && e.type === EDGE_TYPES.SEQUENCE
    )

    // Sort edges by their targetHandle index (seq-in-0, seq-in-1, etc.)
    // This perfectly matches the top-to-bottom visual order in the node.
    const sortedEdges = [...sequenceEdges].sort((a, b) => {
      const indexA = parseInt(a.targetHandle?.replace('seq-in-', '') || '0', 10)
      const indexB = parseInt(b.targetHandle?.replace('seq-in-', '') || '0', 10)
      return indexA - indexB
    })

    // Execute each source terminal in order, waiting for the previous to finish
    for (const edge of sortedEdges) {
      const targetNode = nodes.find(n => n.id === edge.source)
      if (
        targetNode?.type === NODE_TYPES.TERMINAL ||
        targetNode?.type === NODE_TYPES.SSH_TERMINAL
      ) {
        // executeTerminalNode handles creating the terminal if it doesn't exist
        // and iterating through its own command chain sequentially.
        // Awaiting this means the next terminal in the sequence only starts
        // a boolean flag `true` indicates this terminal is part of a Sequence execution.
        await executeTerminalNode(targetNode.id, true)
      }
    }
  }, [executeTerminalNode])

  return { executeSequenceNode }
}
